resource "google_artifact_registry_repository" "images" {
  location      = var.region
  repository_id = var.artifact_repo
  description   = "EyeLecture container images"
  format        = "DOCKER"

  # Untagged images pile up fast with a deploy-per-merge workflow and are billed
  # by the gigabyte, so drop them once anything newer exists.
  cleanup_policies {
    id     = "delete-untagged"
    action = "DELETE"
    condition {
      tag_state  = "UNTAGGED"
      older_than = "604800s" # 7 days
    }
  }

  cleanup_policies {
    id     = "keep-recent-tagged"
    action = "KEEP"
    most_recent_versions {
      keep_count = 20
    }
  }
}

# The runtime identities pull their own images.
resource "google_artifact_registry_repository_iam_member" "api_reader" {
  location   = google_artifact_registry_repository.images.location
  repository = google_artifact_registry_repository.images.name
  role       = "roles/artifactregistry.reader"
  member     = "serviceAccount:${google_service_account.api.email}"
}

resource "google_artifact_registry_repository_iam_member" "web_reader" {
  location   = google_artifact_registry_repository.images.location
  repository = google_artifact_registry_repository.images.name
  role       = "roles/artifactregistry.reader"
  member     = "serviceAccount:${google_service_account.web.email}"
}
