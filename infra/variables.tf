variable "project_id" {
  type        = string
  description = "GCP project ID."
  default     = "eyelecture"
}

variable "region" {
  type        = string
  description = "Region for Cloud Run, Cloud SQL and Artifact Registry. Keep them aligned — cross-region image pulls are slower and cost more."
  default     = "us-central1"
}

variable "artifact_repo" {
  type        = string
  description = "Artifact Registry repository name."
  default     = "eyelecture"
}

variable "api_image" {
  type        = string
  description = <<-EOT
    Full image reference for the API. Defaults to Google's hello container so the
    very first apply succeeds before any image has been pushed — the deploy
    workflow replaces it on the first run. See README for the ordering.
  EOT
  default     = "gcr.io/cloudrun/hello"
}

variable "web_image" {
  type        = string
  description = "Full image reference for the web frontend. Same placeholder rationale as api_image."
  default     = "gcr.io/cloudrun/hello"
}

variable "db_tier" {
  type        = string
  description = "Cloud SQL machine type. db-f1-micro is the cheapest that runs Postgres 17."
  default     = "db-f1-micro"
}

variable "db_name" {
  type    = string
  default = "eyelecture"
}

variable "db_user" {
  type    = string
  default = "eyelecture"
}

variable "min_instances" {
  type        = number
  description = "Cloud Run minimum instances. 0 means scale to zero — free when idle, at the cost of a cold start."
  default     = 0
}

variable "deletion_protection" {
  type        = bool
  description = "Guards the Cloud SQL instance against `terraform destroy`. Turn off deliberately."
  default     = true
}
