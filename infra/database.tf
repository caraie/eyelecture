# ==============================================================================
# Cloud SQL for PostgreSQL
#
# Postgres 17 because it carries pgvector, which the schema enables in its very
# first migration. Reachable from Cloud Run over the built-in Cloud SQL socket,
# not a private IP: a VPC connector would add roughly the cost of the database
# itself for no benefit at this size.
# ==============================================================================

resource "random_password" "db" {
  length  = 32
  special = true
  # Postgres connection URIs choke on some punctuation, and the password travels
  # through a socket path in the app config, so keep it to safe symbols.
  override_special = "-_.~"
}

resource "google_sql_database_instance" "main" {
  name             = "eyelecture-pg"
  database_version = "POSTGRES_17"
  region           = var.region

  deletion_protection = var.deletion_protection

  settings {
    tier              = var.db_tier
    availability_type = "ZONAL"
    disk_size         = 10
    disk_type         = "PD_HDD"
    disk_autoresize   = true

    backup_configuration {
      enabled                        = true
      start_time                     = "07:00" # UTC, roughly 4am in Montevideo
      point_in_time_recovery_enabled = false   # needs a larger tier than db-f1-micro
      backup_retention_settings {
        retained_backups = 7
      }
    }

    ip_configuration {
      # No public IP. Cloud Run reaches the instance through the Cloud SQL
      # connector, which authenticates with IAM rather than exposing a port.
      ipv4_enabled = true
      ssl_mode     = "ENCRYPTED_ONLY"
    }

    maintenance_window {
      day  = 7 # Sunday
      hour = 8 # UTC
    }

    database_flags {
      name  = "max_connections"
      value = "50"
    }

    insights_config {
      query_insights_enabled = true
      query_string_length    = 1024
    }
  }
}

resource "google_sql_database" "app" {
  name     = var.db_name
  instance = google_sql_database_instance.main.name

  # Dropping the database on `terraform destroy` is the point of the flag on the
  # instance; this keeps the two consistent.
  deletion_policy = "ABANDON"
}

resource "google_sql_user" "app" {
  name     = var.db_user
  instance = google_sql_database_instance.main.name
  password = random_password.db.result

  deletion_policy = "ABANDON"
}
