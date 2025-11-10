
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
      DYNAMODB_ROUTES_TABLE_NAME = local.sprawdzamszlak_routes_table.name
      S3_BUCKET_NAME           = aws_s3_bucket.geojson_bucket.id
      MY_AWS_REGION            = "eu-west-1"
    }
  }
}

resource "aws_apigatewayv2_api" "http_api" {
  name          = "${local.app_name}-api"
  protocol_type = "HTTP"
  
  cors_configuration {
    allow_origins = ["*"]
    allow_methods = ["GET", "POST", "OPTIONS"]
    allow_headers = ["*"]
  }
}

resource "aws_apigatewayv2_integration" "lambda_integration" {
  api_id = aws_apigatewayv2_api.http_api.id

  integration_type = "AWS_PROXY"
  integration_uri  = aws_lambda_function.sprawdzamszlak_lambda.invoke_arn

  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "get_route" {
  api_id = aws_apigatewayv2_api.http_api.id
  route_key = "GET /" 
  target    = "integrations/${aws_apigatewayv2_integration.lambda_integration.id}"
}

resource "aws_apigatewayv2_route" "post_route" {
  api_id = aws_apigatewayv2_api.http_api.id
  route_key = "POST /"
  target    = "integrations/${aws_apigatewayv2_integration.lambda_integration.id}"
}

resource "aws_apigatewayv2_route" "get_routes_route" {
  api_id = aws_apigatewayv2_api.http_api.id
  route_key = "GET /routes"
  target    = "integrations/${aws_apigatewayv2_integration.lambda_integration.id}"
}

resource "aws_apigatewayv2_deployment" "main_deployment" {
  api_id = aws_apigatewayv2_api.http_api.id

  triggers = {
    redeployment_hash = md5(jsonencode([
      aws_apigatewayv2_route.get_route,
      aws_apigatewayv2_route.post_route,
      aws_apigatewayv2_route.get_routes_route,
      aws_apigatewayv2_integration.lambda_integration
    ]))
  }

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_apigatewayv2_stage" "prod_stage" {
  api_id = aws_apigatewayv2_api.http_api.id
  name   = "prod"
  
  deployment_id = aws_apigatewayv2_deployment.main_deployment.id
}

resource "aws_lambda_permission" "api_gateway_permission" {
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.sprawdzamszlak_lambda.function_name
  principal     = "apigateway.amazonaws.com"
  
  source_arn = "${aws_apigatewayv2_api.http_api.execution_arn}/${aws_apigatewayv2_stage.prod_stage.name}/*/*"
}

output "api_endpoint" {
  description = "The public invoke URL for the sprawdzamszlak API (prod stage)"
  value       = "${aws_apigatewayv2_api.http_api.api_endpoint}/${aws_apigatewayv2_stage.prod_stage.name}"
}