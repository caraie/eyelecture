output "web_url" {
  description = "Public URL of the app. This is the one to open in a browser."
  value       = google_cloud_run_v2_service.web.uri
}

# The DNS records the mapping is waiting for. Publish these at the registrar and
# the managed certificate follows on its own. Empty when no domain is configured.
output "web_domain_dns_records" {
  description = "Records to create at the DNS registrar for the custom domain."
  value = var.web_domain == "" ? [] : [
    for record in google_cloud_run_domain_mapping.web[0].status[0].resource_records :
    "${record.type}  ${coalesce(record.name, "@")}  ${record.rrdata}"
  ]
}

output "api_url" {
  description = "Public URL of the API. The frontend proxies to it, so you rarely need this directly."
  value       = google_cloud_run_v2_service.api.uri
}

output "api_health_url" {
  value = "${google_cloud_run_v2_service.api.uri}/api/v1/health"
}

output "db_connection_name" {
  description = "Pass to `gcloud sql connect` or the Cloud SQL Auth Proxy."
  value       = google_sql_database_instance.main.connection_name
}

output "artifact_registry" {
  description = "Docker image prefix used by the deploy workflow."
  value       = "${var.region}-docker.pkg.dev/${var.project_id}/${var.artifact_repo}"
}

output "migrate_job" {
  value = google_cloud_run_v2_job.migrate.name
}

# The generated database password. Marked sensitive so it never lands in a log or
# a PR comment; read it deliberately with `terraform output -raw db_password`.
output "db_password" {
  value     = random_password.db.result
  sensitive = true
}
