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
  description = "Aurora Serverless v2 minimum ACU."
  type        = number
  default     = 0.5
}

variable "aurora_max_acu" {
  description = "Aurora Serverless v2 maximum ACU."
  type        = number
  default     = 2
}
