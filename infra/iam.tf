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

# Lets the API identity sign JWTs *as itself*, which is what sending mail through
# Gmail depends on. The alternative is downloading a service-account JSON key and
# storing it as a secret — a long-lived credential that is only as safe as every
# place it has ever been copied. This keeps the signing inside Google.
#
# Note this is granted on the service account, not project-wide: it can sign for
# itself and for nothing else.
#
# The other half of the grant cannot be expressed here. Domain-wide delegation is
# authorised in the Google Workspace admin console, against this account's numeric
# client ID and scoped to https://www.googleapis.com/auth/gmail.send. Until somebody
# does that by hand, sending fails with "unauthorized_client".
resource "google_service_account_iam_member" "api_self_token_creator" {
  service_account_id = google_service_account.api.name
  role               = "roles/iam.serviceAccountTokenCreator"
  member             = "serviceAccount:${google_service_account.api.email}"
}

# The migration job runs the same image as the API and needs the same access, so
# it reuses the API identity rather than introducing a third one.
