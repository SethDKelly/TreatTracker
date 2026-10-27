locals {
  use_custom_domain = var.domain_name != ""

  hosted_zone_id = local.use_custom_domain ? (
    var.hosted_zone_id != "" ? var.hosted_zone_id : data.aws_route53_zone.selected[0].zone_id
  ) : ""

  tags = {
    Project     = "TreatTracker"
    Environment = var.environment
  }
}

data "aws_route53_zone" "selected" {
  count = local.use_custom_domain && var.hosted_zone_id == "" ? 1 : 0

  name         = var.hosted_zone_name
  private_zone = false
}

check "custom_domain_zone" {
  assert {
    condition     = !local.use_custom_domain || local.hosted_zone_id != ""
    error_message = "hosted_zone_id or a resolvable hosted_zone_name is required when domain_name is set."
  }
}
