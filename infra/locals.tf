locals {
  use_custom_domain = var.domain_name != ""

  tags = {
    Project     = "TreatTracker"
    Environment = var.environment
  }
}

check "custom_domain_zone" {
  assert {
    condition     = !local.use_custom_domain || var.hosted_zone_id != ""
    error_message = "hosted_zone_id is required when domain_name is set."
  }
}
