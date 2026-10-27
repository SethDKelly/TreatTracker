resource "aws_s3_bucket" "spa" {
  bucket_prefix = "${var.name_prefix}-spa-"

  tags = {
    Name = "${var.name_prefix}-spa"
  }
}

resource "aws_s3_bucket_public_access_block" "spa" {
  bucket = aws_s3_bucket.spa.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "spa" {
  bucket = aws_s3_bucket.spa.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_cloudfront_origin_access_control" "spa" {
  name                              = "${var.name_prefix}-spa-oac"
  description                       = "OAC for TreatTracker SPA"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_acm_certificate" "spa" {
  count = local.use_custom_domain ? 1 : 0

  provider          = aws.us_east_1
  domain_name       = var.domain_name
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_route53_record" "cert_validation" {
  for_each = local.use_custom_domain ? {
    for dvo in aws_acm_certificate.spa[0].domain_validation_options :
    dvo.domain_name => {
      name   = dvo.resource_record_name
      type   = dvo.resource_record_type
      record = dvo.resource_record_value
    }
  } : {}

  allow_overwrite = true
  zone_id         = local.hosted_zone_id
  name            = each.value.name
  type            = each.value.type
  ttl             = 60
  records         = [each.value.record]
}

resource "aws_acm_certificate_validation" "spa" {
  count = local.use_custom_domain ? 1 : 0

  provider                = aws.us_east_1
  certificate_arn         = aws_acm_certificate.spa[0].arn
  validation_record_fqdns = [for r in aws_route53_record.cert_validation : r.fqdn]
}

resource "aws_cloudfront_function" "season_gate" {
  name    = "${var.name_prefix}-season-gate"
  runtime = "cloudfront-js-2.0"
  publish = true
  code    = file("${path.module}/cloudfront/season-gate.js")
}

resource "aws_cloudfront_distribution" "spa" {
  enabled             = true
  is_ipv6_enabled     = true
  comment             = "TreatTracker ${var.environment}"
  default_root_object = "index.html"
  price_class         = "PriceClass_100"
  aliases             = local.use_custom_domain ? [var.domain_name] : []

  origin {
    domain_name              = aws_s3_bucket.spa.bucket_regional_domain_name
    origin_id                = "s3-spa"
    origin_access_control_id = aws_cloudfront_origin_access_control.spa.id
  }

  default_cache_behavior {
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "s3-spa"
    viewer_protocol_policy = "redirect-to-https"
    compress               = true

    forwarded_values {
      query_string = false
      cookies {
        forward = "none"
      }
    }

    # Off-season: rewrite document requests to /off-season.html (countdown page).
    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.season_gate.arn
    }
  }

  custom_error_response {
    error_code            = 403
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 0
  }

  custom_error_response {
    error_code            = 404
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 0
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = !local.use_custom_domain
    acm_certificate_arn            = local.use_custom_domain ? aws_acm_certificate_validation.spa[0].certificate_arn : null
    ssl_support_method             = local.use_custom_domain ? "sni-only" : null
    minimum_protocol_version       = local.use_custom_domain ? "TLSv1.2_2021" : null
  }

  depends_on = [aws_acm_certificate_validation.spa]
}

data "aws_iam_policy_document" "spa_bucket" {
  statement {
    sid    = "AllowCloudFrontRead"
    effect = "Allow"

    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }

    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.spa.arn}/*"]

    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.spa.arn]
    }
  }
}

resource "aws_s3_bucket_policy" "spa" {
  bucket = aws_s3_bucket.spa.id
  policy = data.aws_iam_policy_document.spa_bucket.json
}

resource "aws_route53_record" "spa_a" {
  count = local.use_custom_domain ? 1 : 0

  zone_id = local.hosted_zone_id
  name    = var.domain_name
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.spa.domain_name
    zone_id                = aws_cloudfront_distribution.spa.hosted_zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "spa_aaaa" {
  count = local.use_custom_domain ? 1 : 0

  zone_id = local.hosted_zone_id
  name    = var.domain_name
  type    = "AAAA"

  alias {
    name                   = aws_cloudfront_distribution.spa.domain_name
    zone_id                = aws_cloudfront_distribution.spa.hosted_zone_id
    evaluate_target_health = false
  }
}
