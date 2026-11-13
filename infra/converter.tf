# ==============================================================================
# Converter — LibreOffice behind a tiny HTTP service
#
# Authors work in PowerPoint; the slide viewer reads PDF. Something has to run
# LibreOffice, and it is not going to be the API: the office suite is most of a
# gigabyte and the API would pay for it on every cold start, for a job it does
# a few times a day. So it lives here, scaled to zero, costing nothing while
# nobody is uploading a deck.
#
# Private at the network edge. Only the API's identity may call it, with a
# Google-signed ID token — unlike the API, this service has no auth of its own
# and nothing about it should be reachable from the internet.
# ==============================================================================

resource "google_service_account" "converter" {
  account_id   = "eyelecture-converter"
  display_name = "EyeLecture converter runtime"
}

# It reads the uploaded deck and writes the PDF beside it. Nothing else.
resource "google_storage_bucket_iam_member" "converter_object_admin" {
  bucket = google_storage_bucket.media.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.converter.email}"
}

resource "google_cloud_run_v2_service" "converter" {
  name     = "eyelecture-converter"
  location = var.region
  ingress  = "INGRESS_TRAFFIC_INTERNAL_ONLY"

  deletion_protection = false

  template {
    service_account = google_service_account.converter.email

    # Always from cold. A deck arrives rarely enough that paying for a warm
    # instance all day would cost more than the wait it saves.
    scaling {
      min_instance_count = 0
      max_instance_count = 3
    }

    # LibreOffice on a large deck is minutes, not seconds, and the API waits on
    # this call while the author watches a spinner. The service's own timeout is
    # the shorter of the two, so a hung conversion fails here with a message
    # rather than at the API with a dead socket.
    timeout = "900s"

    # One conversion at a time per instance: soffice is a desktop program being
    # used as a library, and two of them on one small instance contend for
    # memory and for their own profile directory.
    max_instance_request_concurrency = 1

    containers {
      image = var.converter_image

      ports {
        container_port = 8080
      }

      resources {
        limits = {
          cpu    = "2"
          memory = "2Gi"
        }
        # No cpu_idle: there is nothing to do between requests, and the work
        # inside one is entirely CPU.
        startup_cpu_boost = true
      }

      startup_probe {
        initial_delay_seconds = 0
        period_seconds        = 2
        timeout_seconds       = 2
        failure_threshold     = 30
        http_get {
          path = "/healthz"
        }
      }
    }
  }

  lifecycle {
    ignore_changes = [template[0].containers[0].image, client, client_version]
  }
}

# The only caller.
resource "google_cloud_run_v2_service_iam_member" "converter_caller" {
  location = google_cloud_run_v2_service.converter.location
  name     = google_cloud_run_v2_service.converter.name
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.api.email}"
}
