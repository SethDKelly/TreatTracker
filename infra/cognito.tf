resource "aws_cognito_user_pool" "main" {
  name           = "${var.name_prefix}-users"
  user_pool_tier = "ESSENTIALS"

  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]
  mfa_configuration        = "OFF"

  sign_in_policy {
    allowed_first_auth_factors = ["PASSWORD", "EMAIL_OTP"]
  }

  password_policy {
    minimum_length                   = 8
    require_lowercase                = true
    require_numbers                  = true
    require_symbols                  = true
    require_uppercase                = true
    temporary_password_validity_days = 7
  }

  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }

  email_configuration {
    email_sending_account = "COGNITO_DEFAULT"
  }

  lambda_config {
    pre_sign_up = aws_lambda_function.presignup.arn
  }

  schema {
    name                = "email"
    attribute_data_type = "String"
    mutable             = true
    required            = true

    string_attribute_constraints {
      min_length = 3
      max_length = 256
    }
  }

  verification_message_template {
    default_email_option = "CONFIRM_WITH_CODE"
    email_subject        = "Your TreatTracker code"
    email_message        = "Your TreatTracker verification code is {####}."
  }
}

resource "aws_cognito_user_pool_client" "spa" {
  name         = "${var.name_prefix}-spa"
  user_pool_id = aws_cognito_user_pool.main.id

  generate_secret                               = false
  prevent_user_existence_errors                 = "ENABLED"
  enable_token_revocation                       = true
  enable_propagate_additional_user_context_data = false

  explicit_auth_flows = [
    "ALLOW_USER_AUTH",
    "ALLOW_USER_SRP_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH",
  ]

  supported_identity_providers = ["COGNITO"]

  access_token_validity  = 1
  id_token_validity      = 1
  refresh_token_validity = 30

  token_validity_units {
    access_token  = "hours"
    id_token      = "hours"
    refresh_token = "days"
  }

  # SDK email-OTP auth does not redirect here; kept for Amplify completeness.
  callback_urls = compact([
    "http://localhost:5173/",
    "https://${aws_cloudfront_distribution.spa.domain_name}/",
    local.use_custom_domain ? "https://${var.domain_name}/" : null,
  ])

  logout_urls = compact([
    "http://localhost:5173/",
    "https://${aws_cloudfront_distribution.spa.domain_name}/",
    local.use_custom_domain ? "https://${var.domain_name}/" : null,
  ])
}
