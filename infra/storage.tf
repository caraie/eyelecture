# Where lecture files live: presentations, videos and tile images.
#
# Private, always. Nothing in this bucket is served by its own URL — the API
# hands out short-lived signed links, so a video cannot be passed around by
# copying an address out of the page. Uniform bucket-level access turns off
# per-object ACLs entirely, which is the only way to be sure of that.
#
# Uploads go from the browser straight to the bucket with a signed PUT, not
# through Cloud Run: a request to Cloud Run is capped at 32 MiB and a lecture
# video is not.

resource "google_storage_bucket" "media" {
  name     = "${var.project_id}-lecture-media"
  location = var.region

  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"

  # The app deletes objects when a lecture's file is replaced or removed, so
  # versioning is what stands between a mistaken replace and a lost lecture.
  versioning {
    enabled = true
  }

  lifecycle_rule {
    condition {
      num_newer_versions = 3
    }
    action {
      type = "Delete"
    }
  }

  # A browser PUTs straight to the bucket, so the bucket itself has to allow the
  # app's origin — the signed URL is not enough on its own.
  cors {
    origin          = local.cors_origins
    method          = ["GET", "PUT", "HEAD"]
    response_header = ["Content-Type", "Content-Length", "ETag"]
    max_age_seconds = 3600
  }
}

# The API reads and writes objects, and nothing else in the project does.
resource "google_storage_bucket_iam_member" "api_object_admin" {
  bucket = google_storage_bucket.media.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.api.email}"
}

# Signing a URL needs a private key, and a Cloud Run service account has none:
# it asks the IAM Credentials API to sign on its behalf instead. That call is
# only allowed if the account may impersonate itself, which is what this grants.
# Without it every signed URL fails at issue time with a 403 from iam.
resource "google_project_iam_member" "api_token_creator" {
  project = var.project_id
  role    = "roles/iam.serviceAccountTokenCreator"
  member  = "serviceAccount:${google_service_account.api.email}"
}
