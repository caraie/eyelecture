# ==============================================================================
# Runtime service accounts
#
# One identity per service, each with only what that service needs. The API talks
# to Cloud SQL and reads secrets; the web frontend does neither — it only proxies
# HTTP — so it gets an identity with no project roles at all.
# ==============================================================================

resource "google_service_account" "api" {
  account_id   = "eyelecture-api"
  display_name = "EyeLecture API runtime"
}

resource "google_service_account" "web" {
  account_id   = "eyelecture-web"
  display_name = "EyeLecture web runtime"
}

resource "google_project_iam_member" "api_sql_client" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.api.email}"
}

# Structured logs from the containers.
resource "google_project_iam_member" "api_log_writer" {
  project = var.project_id
  role    = "roles/logging.logWriter"
  member  = "serviceAccount:${google_service_account.api.email}"
}

resource "google_project_iam_member" "web_log_writer" {
  project = var.project_id
  role    = "roles/logging.logWriter"
  member  = "serviceAccount:${google_service_account.web.email}"
}

# The migration job runs the same image as the API and needs the same access, so
# it reuses the API identity rather than introducing a third one.
