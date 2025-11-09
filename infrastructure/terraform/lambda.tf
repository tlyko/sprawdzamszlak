
data "archive_file" "lambda_zip" {
  type        = "zip"
  source_dir  = "${path.module}/src"
  output_path = "${path.module}/dist/lambda.zip"
}

resource "aws_lambda_function" "sprawdzamszlak_lambda" {
  function_name = local.app_name
  filename      = data.archive_file.lambda_zip.output_path
  source_code_hash = data.archive_file.lambda_zip.output_base64sha256
  role    = aws_iam_role.sprawdzamszlak_app_role.arn
  
  handler = "lambda_function.lambda_handler"
  runtime = "python3.13"

  environment {
    variables = {
      DYNAMODB_TABLE_NAME = local.sprawdzamszlak_table.name
    }
  }
}

resource "aws_apigatewayv2_api" "http_api" {
  name          = "${local.app_name}-api"
  protocol_type = "HTTP"
  
  cors_configuration {
    allow_origins = ["*"]
    allow_methods = ["*"]
    allow_headers = ["*"]
  }
}

resource "aws_apigatewayv2_integration" "lambda_integration" {
  api_id = aws_apigatewayv2_api.http_api.id

  integration_type = "AWS_PROXY"
  integration_uri  = aws_lambda_function.sprawdzamszlak_lambda.invoke_arn
}

resource "aws_apigatewayv2_route" "proxy_route" {
  api_id = aws_apigatewayv2_api.http_api.id
  route_key = "$default"
  target    = "integrations/${aws_apigatewayv2_integration.lambda_integration.id}"
}

resource "aws_apigatewayv2_stage" "default_stage" {
  api_id = aws_apigatewayv2_api.http_api.id
  name   = "$default"
  auto_deploy = true

  depends_on = [
    aws_apigatewayv2_route.proxy_route
  ]
}

resource "aws_lambda_permission" "api_gateway_permission" {
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.sprawdzamszlak_lambda.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn = "${aws_apigatewayv2_api.http_api.execution_arn}/*"
}

output "api_endpoint" {
  description = "The public invoke URL for the sprawdzamszlak API"
  value       = aws_apigatewayv2_api.http_api.api_endpoint
}