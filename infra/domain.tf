# ==============================================================================
# Custom domain for the web frontend
#
# Cloud Run domain mappings, rather than a global external Application Load
# Balancer. The load balancer is what Google recommends for production — it
# brings Cloud CDN, Cloud Armor and bring-your-own certificates — but it also
# costs around USD 20 a month simply to exist, which is hard to justify for an
# environment whose job is to let a handful of people try the product. Mappings
# are free and issue a managed certificate on their own.
#
# What they cost instead: they are still a preview feature, they only work in a
# few regions (us-central1 among them), and they do not support HTTP/2 or
# WebSockets. Moving to a load balancer later is a DNS change and a new set of
# Terraform resources, not an application change, so this is not a door closing.
#
# Two things must be true before an apply succeeds, and neither is expressible
# here:
#
#   1. the domain is verified in Search Console by whoever runs Terraform
#      (https://search.google.com/search-console) — verifying the apex covers
#      every subdomain under it
#   2. the DNS records this resource outputs exist at the registrar
#
# Ordering is deliberate: create the mapping first, read the records it asks
# for out of the output, then publish them. Google issues the certificate once
# it can resolve the name, which is usually minutes but can take up to a day.
# ==============================================================================

resource "google_cloud_run_domain_mapping" "web" {
  count    = var.web_domain == "" ? 0 : 1
  name     = var.web_domain
  location = var.region

  metadata {
    namespace = var.project_id
  }

  spec {
    route_name = google_cloud_run_v2_service.web.name
  }
}
