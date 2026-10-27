variable "aws_region" {
  description = "Primary region for app resources (API, Aurora, Cognito)."
  type        = string
  default     = "us-east-2"
}

variable "aws_account_id" {
  description = "AWS account ID (used in unique bucket names)."
  type        = string
  default     = "521018312783"
}

variable "environment" {
  description = "Environment name (used in resource names)."
  type        = string
  default     = "dev"
}

variable "name_prefix" {
  description = "IAM/resource name prefix. Must stay within treattracker-dev for deploy-role IAM."
  type        = string
  default     = "treattracker-dev"
}

variable "domain_name" {
  description = "Public hostname for the SPA under SkellyHouse DNS."
  type        = string
  default     = "treattracker.skellyhouse.com"
}

variable "hosted_zone_name" {
  description = "Route53 public hosted zone name used when hosted_zone_id is empty."
  type        = string
  default     = "skellyhouse.com"
}

variable "hosted_zone_id" {
  description = "Optional explicit Route53 hosted zone ID. When empty, looked up by hosted_zone_name."
  type        = string
  default     = ""
}

variable "db_name" {
  description = "Aurora database name."
  type        = string
  default     = "treattracker"
}

variable "admin_emails" {
  description = "Comma-separated emails allowed to download the full (all users) CSV export."
  type        = string
  default     = "ollioxenhomefree@gmail.com"
}

variable "aurora_min_acu" {
  description = "In-season Aurora Serverless v2 minimum ACU (scale-up target)."
  type        = number
  default     = 0.5
}

variable "aurora_max_acu" {
  description = "In-season Aurora Serverless v2 maximum ACU (scale-up target)."
  type        = number
  default     = 2
}

variable "aurora_off_min_acu" {
  description = "Off-season minimum ACU (0 enables auto-pause)."
  type        = number
  default     = 0
}

variable "aurora_off_max_acu" {
  description = "Off-season maximum ACU (kept small; cluster can still wake for rare reads)."
  type        = number
  default     = 1
}

variable "aurora_auto_pause_seconds" {
  description = "Idle seconds before Aurora pauses when min ACU is 0 (300–86400)."
  type        = number
  default     = 300
}

variable "aurora_scale_up_cron" {
  description = "EventBridge cron (America/Chicago) to restore in-season ACUs. Default: Oct 23 12:00."
  type        = string
  default     = "cron(0 12 23 10 ? *)"
}

variable "aurora_scale_down_cron" {
  description = "EventBridge cron (America/Chicago) to set off-season ACUs. Default: Nov 1 13:00."
  type        = string
  default     = "cron(0 13 1 11 ? *)"
}
