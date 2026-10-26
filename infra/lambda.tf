data "archive_file" "api_placeholder" {
  type        = "zip"
  output_path = "${path.module}/.build/api-placeholder.zip"

  source {
    content  = <<-EOF
      exports.handler = async () => ({
        statusCode: 503,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ error: "deploy backend package" }),
      });
    EOF
    filename = "handler.js"
  }
}

resource "aws_iam_role" "api_lambda" {
  name = "${var.name_prefix}-api-lambda"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy" "api_lambda" {
  name = "${var.name_prefix}-api-lambda"
  role = aws_iam_role.api_lambda.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "Logs"
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents",
        ]
        Resource = "arn:aws:logs:${var.aws_region}:*:log-group:/aws/lambda/${var.name_prefix}-api*"
      },
      {
        Sid    = "RdsDataApi"
        Effect = "Allow"
        Action = [
          "rds-data:ExecuteStatement",
          "rds-data:BatchExecuteStatement",
          "rds-data:BeginTransaction",
          "rds-data:CommitTransaction",
          "rds-data:RollbackTransaction",
        ]
        Resource = aws_rds_cluster.main.arn
      },
      {
        Sid      = "Secrets"
        Effect   = "Allow"
        Action   = ["secretsmanager:GetSecretValue"]
        Resource = aws_rds_cluster.main.master_user_secret[0].secret_arn
      }
    ]
  })
}

resource "aws_lambda_function" "api" {
  function_name = "${var.name_prefix}-api"
  role          = aws_iam_role.api_lambda.arn
  handler       = "handler.handler"
  runtime       = "nodejs20.x"
  timeout       = 30
  memory_size   = 256

  filename         = data.archive_file.api_placeholder.output_path
  source_code_hash = data.archive_file.api_placeholder.output_base64sha256

  environment {
    variables = {
      CLUSTER_ARN = aws_rds_cluster.main.arn
      SECRET_ARN  = aws_rds_cluster.main.master_user_secret[0].secret_arn
      DB_NAME     = var.db_name
    }
  }

  depends_on = [
    aws_rds_cluster_instance.main,
    aws_iam_role_policy.api_lambda,
  ]

  lifecycle {
    ignore_changes = [
      filename,
      source_code_hash,
    ]
  }
}

resource "aws_cloudwatch_log_group" "api" {
  name              = "/aws/lambda/${aws_lambda_function.api.function_name}"
  retention_in_days = 14
}
