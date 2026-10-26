output "api_url" {
  description = "HTTP API base URL."
  value       = aws_apigatewayv2_api.http.api_endpoint
}

output "cognito_user_pool_id" {
  value = aws_cognito_user_pool.main.id
}

output "cognito_client_id" {
  value = aws_cognito_user_pool_client.spa.id
}

output "cognito_region" {
  value = var.aws_region
}

output "spa_bucket_name" {
  value = aws_s3_bucket.spa.bucket
}

output "cloudfront_distribution_id" {
  value = aws_cloudfront_distribution.spa.id
}

output "cloudfront_domain_name" {
  value = aws_cloudfront_distribution.spa.domain_name
}

output "app_url" {
  description = "Public SPA URL (custom domain when configured)."
  value       = local.use_custom_domain ? "https://${var.domain_name}" : "https://${aws_cloudfront_distribution.spa.domain_name}"
}

output "lambda_function_name" {
  value = aws_lambda_function.api.function_name
}

output "aurora_cluster_arn" {
  value = aws_rds_cluster.main.arn
}
