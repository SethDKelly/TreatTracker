data "aws_caller_identity" "current" {}

data "archive_file" "presignup" {
  type        = "zip"
  output_path = "${path.module}/.build/presignup.zip"

  source {
    content  = <<-JS
      exports.handler = async (event) => {
        event.response.autoConfirmUser = true;
        event.response.autoVerifyEmail = true;
        return event;
      };
    JS
    filename = "index.js"
  }
}

resource "aws_iam_role" "presignup" {
  name = "${var.name_prefix}-cognito-presignup"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy" "presignup_logs" {
  name = "${var.name_prefix}-cognito-presignup-logs"
  role = aws_iam_role.presignup.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"]
      Resource = "arn:aws:logs:${var.aws_region}:${data.aws_caller_identity.current.account_id}:*"
    }]
  })
}

resource "aws_lambda_function" "presignup" {
  function_name    = "${var.name_prefix}-cognito-presignup"
  role             = aws_iam_role.presignup.arn
  handler          = "index.handler"
  runtime          = "nodejs20.x"
  timeout          = 5
  filename         = data.archive_file.presignup.output_path
  source_code_hash = data.archive_file.presignup.output_base64sha256
}

resource "aws_lambda_permission" "presignup_cognito" {
  statement_id  = "AllowCognitoInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.presignup.function_name
  principal     = "cognito-idp.amazonaws.com"
  source_arn    = aws_cognito_user_pool.main.arn
}
