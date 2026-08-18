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

# ==============================================================================
# Mail
#
# Sending goes through Gmail as a Workspace user, using domain-wide delegation.
# Two things have to be true before any of this works, and neither can be done from
# Terraform:
#
#   1. the Gmail API and the IAM Service Account Credentials API enabled on the project
#   2. the API service account's numeric client ID authorised in the Workspace admin
#      console (Security -> Access and data control -> API controls -> Domain-wide
#      delegation) for exactly this scope:
#          https://www.googleapis.com/auth/gmail.send
#
# Until then, leave mail_enabled false. The app degrades to logging the link.
# ==============================================================================

# ==============================================================================
# Custom domain
# ==============================================================================

variable "web_domain" {
  type        = string
  description = <<-EOT
    Custom domain for the web frontend, e.g. "eyelecture-d.next2.ai". Empty
    disables the mapping and leaves everything on run.app. The domain must be
    verified in Search Console by whoever runs Terraform before an apply will
    succeed. See domain.tf.
  EOT
  default     = ""
}

variable "mail_enabled" {
  type        = bool
  description = "Actually send mail. False keeps the old behaviour: links go to the log."
  default     = false
}

variable "mail_from" {
  type        = string
  description = "From header. The address should belong to the impersonated mailbox."
  default     = "EyeLecture <no-reply@example.com>"
}

variable "mail_impersonate" {
  type        = string
  description = "Workspace mailbox the service account sends as. Gmail has no application identity — mail always comes from a person."
  default     = ""
}

variable "mail_allowed_domains" {
  type        = list(string)
  description = "Domains mail may reach. Empty means no restriction. Set it to keep a test build from reaching a real institution's inbox."
  default     = []
}
