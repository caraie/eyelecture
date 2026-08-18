data "google_project" "this" {
  project_id = var.project_id
}

locals {
  # The API connects over the Cloud SQL unix socket that Cloud Run mounts for us.
  # node-postgres treats a host beginning with "/" as a socket directory, so this
  # value goes straight into DB_HOST with no code change.
  db_socket_host = "/cloudsql/${google_sql_database_instance.main.connection_name}"

  # Cloud Run URLs follow "<service>-<project-number>.<region>.run.app". The web
  # service reads the API's real .uri attribute, but the API needs the web URL for
  # its CORS allowlist — referencing web.uri there would be a dependency cycle, so
  # that one direction uses the predictable form instead.
  web_url = "https://eyelecture-web-${data.google_project.this.number}.${var.region}.run.app"
}

# ==============================================================================
# API — NestJS
# ==============================================================================
resource "google_cloud_run_v2_service" "api" {
  name     = "eyelecture-api"
  location = var.region
  ingress  = "INGRESS_TRAFFIC_ALL"

  deletion_protection = false

  template {
    service_account = google_service_account.api.email

    scaling {
      min_instance_count = var.min_instances
      max_instance_count = 5
    }

    # Mounts the Cloud SQL socket into the container at /cloudsql/<connection>.
    volumes {
      name = "cloudsql"
      cloud_sql_instance {
        instances = [google_sql_database_instance.main.connection_name]
      }
    }

    containers {
      image = var.api_image

      # Cloud Run injects PORT; main.ts reads it. Never hardcode 3000 here.
      ports {
        container_port = 8080
      }

      volume_mounts {
        name       = "cloudsql"
        mount_path = "/cloudsql"
      }

      env {
        name  = "NODE_ENV"
        value = "production"
      }
      env {
        name  = "DB_HOST"
        value = local.db_socket_host
      }
      env {
        name  = "DB_PORT"
        value = "5432"
      }
      env {
        name  = "DB_NAME"
        value = var.db_name
      }
      env {
        name  = "DB_USERNAME"
        value = var.db_user
      }
      env {
        name  = "DB_SSL"
        value = "false" # the socket is already inside Google's network
      }
      env {
        name  = "DB_SYNCHRONIZE"
        value = "false" # schema changes go through the migration job
      }
      env {
        name  = "CORS_ORIGINS"
        value = local.web_url
      }
      env {
        name  = "FRONTEND_URL"
        value = local.web_url
      }

      # Mail. Off unless var.mail_enabled says otherwise, so a deploy that forgets
      # the rest of these sends nothing rather than sending badly.
      env {
        name  = "MAIL_ENABLED"
        value = var.mail_enabled ? "true" : "false"
      }
      env {
        name  = "MAIL_FROM"
        value = var.mail_from
      }
      # Gmail sends as a person, not as an application, so this is the mailbox the
      # service account acts as. It has to match the address the domain-wide
      # delegation was granted for.
      env {
        name  = "MAIL_IMPERSONATE"
        value = var.mail_impersonate
      }
      # Empty means no restriction. Fill it in and nothing outside these domains can
      # be reached — the switch that makes a test build safe to point at real signups.
      env {
        name  = "MAIL_ALLOWED_DOMAINS"
        value = join(",", var.mail_allowed_domains)
      }

      dynamic "env" {
        for_each = {
          DB_PASSWORD        = "db-password"
          JWT_ACCESS_SECRET  = "jwt-access-secret"
          JWT_REFRESH_SECRET = "jwt-refresh-secret"
        }
        content {
          name = env.key
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.this[env.value].secret_id
              version = "latest"
            }
          }
        }
      }

      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
        # Without this the CPU is throttled between requests, which makes the
        # first request after a scale-up pay for a cold Nest bootstrap twice.
        cpu_idle          = true
        startup_cpu_boost = true
      }

      startup_probe {
        initial_delay_seconds = 5
        period_seconds        = 5
        timeout_seconds       = 3
        failure_threshold     = 10
        http_get {
          path = "/api/v1/health"
        }
      }

      liveness_probe {
        period_seconds    = 30
        timeout_seconds   = 5
        failure_threshold = 3
        http_get {
          path = "/api/v1/health"
        }
      }
    }
  }

  depends_on = [
    google_secret_manager_secret_iam_member.api_access,
    google_project_iam_member.api_sql_client,
  ]

  lifecycle {
    # The deploy workflow is what moves the image forward. Without this, the next
    # `terraform apply` would roll the service back to the placeholder.
    ignore_changes = [template[0].containers[0].image, client, client_version]
  }
}

# The API carries its own JWT auth, and the frontend reaches it through nginx —
# a server-side call that has no Google identity to present. So the service is
# open at the network edge and protected at the application layer.
resource "google_cloud_run_v2_service_iam_member" "api_public" {
  location = google_cloud_run_v2_service.api.location
  name     = google_cloud_run_v2_service.api.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

# ==============================================================================
# Web — Angular behind nginx
# ==============================================================================
resource "google_cloud_run_v2_service" "web" {
  name     = "eyelecture-web"
  location = var.region
  ingress  = "INGRESS_TRAFFIC_ALL"

  deletion_protection = false

  template {
    service_account = google_service_account.web.email

    scaling {
      min_instance_count = var.min_instances
      max_instance_count = 5
    }

    containers {
      image = var.web_image

      ports {
        container_port = 8080
      }

      # nginx proxies /api/ here. Hostname only — the entrypoint rejects a value
      # with a scheme, because that produces a confusing nginx resolver error.
      env {
        name  = "API_HOST"
        value = replace(google_cloud_run_v2_service.api.uri, "https://", "")
      }

      resources {
        limits = {
          cpu    = "1"
          memory = "256Mi"
        }
        cpu_idle          = true
        startup_cpu_boost = true
      }

      startup_probe {
        initial_delay_seconds = 3
        period_seconds        = 3
        timeout_seconds       = 3
        failure_threshold     = 10
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

resource "google_cloud_run_v2_service_iam_member" "web_public" {
  location = google_cloud_run_v2_service.web.location
  name     = google_cloud_run_v2_service.web.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

# ==============================================================================
# Migration job
#
# Same image as the API, different command. Run by the deploy workflow *before*
# the new API revision goes live, so the schema is never behind the code.
# ==============================================================================
resource "google_cloud_run_v2_job" "migrate" {
  name     = "eyelecture-migrate"
  location = var.region

  deletion_protection = false

  template {
    task_count = 1

    template {
      service_account = google_service_account.api.email
      max_retries     = 1
      timeout         = "600s"

      volumes {
        name = "cloudsql"
        cloud_sql_instance {
          instances = [google_sql_database_instance.main.connection_name]
        }
      }

      containers {
        image   = var.api_image
        command = ["node"]
        args    = ["./node_modules/typeorm/cli.js", "migration:run", "-d", "dist/database/data-source.js"]

        volume_mounts {
          name       = "cloudsql"
          mount_path = "/cloudsql"
        }

        env {
          name  = "NODE_ENV"
          value = "production"
        }
        env {
          name  = "DB_HOST"
          value = local.db_socket_host
        }
        env {
          name  = "DB_PORT"
          value = "5432"
        }
        env {
          name  = "DB_NAME"
          value = var.db_name
        }
        env {
          name  = "DB_USERNAME"
          value = var.db_user
        }
        env {
          name  = "DB_SSL"
          value = "false"
        }

        env {
          name = "DB_PASSWORD"
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.this["db-password"].secret_id
              version = "latest"
            }
          }
        }

        resources {
          limits = {
            cpu    = "1"
            memory = "512Mi"
          }
        }
      }
    }
  }

  lifecycle {
    ignore_changes = [template[0].template[0].containers[0].image, client, client_version]
  }
}
