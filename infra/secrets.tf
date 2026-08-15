# ==============================================================================
# Secret Manager
#
# Everything the API needs but must never appear in the repo, in Terraform
# outputs, or in a GitHub Actions log. Cloud Run mounts these as env vars by
# reference, so the values are resolved at instance start and never pass through
# the deploy pipeline.
# ==============================================================================

locals {
  secrets = {
    db-password        = random_password.db.result
    jwt-access-secret  = random_password.jwt_access.result
    jwt-refresh-secret = random_password.jwt_refresh.result
  }
}

resource "random_password" "jwt_access" {
  length  = 64
  special = false # hex-ish is plenty of entropy at this length and survives any env encoding
}

resource "random_password" "jwt_refresh" {
  length  = 64
  special = false
}

resource "google_secret_manager_secret" "this" {
  for_each  = local.secrets
  secret_id = each.key

  replication {
    auto {}
  }
}

resource "google_secret_manager_secret_version" "this" {
  for_each    = local.secrets
  secret      = google_secret_manager_secret.this[each.key].id
  secret_data = each.value
}

# The API's runtime identity is the only principal that may read them.
resource "google_secret_manager_secret_iam_member" "api_access" {
  for_each  = google_secret_manager_secret.this
  secret_id = each.value.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.api.email}"
}
