
data "archive_file" "lambda_zip" {
  type        = "zip"
  source_dir  = "${path.module}/../../apps/api/dist"
  output_path = "${path.module}/dist/lambda.zip"
}

resource "aws_cloudwatch_log_group" "lambda_logs" {
  name              = "/aws/lambda/${local.app_name}"
  retention_in_days = 14
}

resource "aws_lambda_function" "sprawdzamszlak_lambda" {
  function_name    = local.app_name
  filename         = data.archive_file.lambda_zip.output_path
  source_code_hash = data.archive_file.lambda_zip.output_base64sha256
  role             = aws_iam_role.sprawdzamszlak_app_role.arn

  handler     = "handler.handler"
  runtime     = "nodejs22.x"
  timeout     = 10
  memory_size = 256

  environment {
    variables = {
      DYNAMODB_TABLE_NAME        = local.sprawdzamszlak_table.name
      DYNAMODB_ROUTES_TABLE_NAME = local.sprawdzamszlak_routes_table.name
      OAUTH_STATES_TABLE         = local.strava_oauth_states_table.name
      STRAVA_EVENTS_TABLE        = local.strava_events_table.name
      S3_BUCKET_NAME             = aws_s3_bucket.geojson_bucket.id
      MY_AWS_REGION              = "eu-west-1"
      STRAVA_REDIRECT_URI        = "${aws_apigatewayv2_api.http_api.api_endpoint}/${local.api_stage}/strava/oauth/callback"
      WEB_BASE_URL               = "https://sprawdzamszlak.pl"
    }
  }

  depends_on = [aws_cloudwatch_log_group.lambda_logs]
}

# Slice C: fetcher Lambda. Same zip as the API Lambda, different handler
# entry point (esbuild produces both bundles in one build). The fetcher
# is on the cold path — DDB Streams gives us seconds, not the API's 2s
# webhook deadline — so a higher timeout is fine for slow Strava calls.

resource "aws_cloudwatch_log_group" "fetcher_logs" {
  name              = "/aws/lambda/${local.app_name}-fetcher"
  retention_in_days = 14
}

resource "aws_lambda_function" "sprawdzamszlak_fetcher" {
  function_name    = "${local.app_name}-fetcher"
  filename         = data.archive_file.lambda_zip.output_path
  source_code_hash = data.archive_file.lambda_zip.output_base64sha256
  role             = aws_iam_role.sprawdzamszlak_app_role.arn

  handler     = "strava/fetcher-handler.handler"
  runtime     = "nodejs22.x"
  timeout     = 30
  memory_size = 256

  environment {
    variables = {
      DYNAMODB_ROUTES_TABLE_NAME = local.sprawdzamszlak_routes_table.name
      S3_BUCKET_NAME             = aws_s3_bucket.geojson_bucket.id
      MY_AWS_REGION              = "eu-west-1"
    }
  }

  depends_on = [aws_cloudwatch_log_group.fetcher_logs]
}

resource "aws_lambda_event_source_mapping" "fetcher_from_events_stream" {
  event_source_arn  = aws_dynamodb_table.strava_events_table.stream_arn
  function_name     = aws_lambda_function.sprawdzamszlak_fetcher.arn
  starting_position = "LATEST"

  # Defaults are fine for our throughput (handful of events per week):
  #   batch_size = 100, maximum_batching_window_in_seconds = 0
  # No on_failure SQS — failed events stay in the source table for 7 days
  # via TTL and can be replayed by re-inserting (Streams will fire again).
}

resource "aws_apigatewayv2_api" "http_api" {
  name          = "${local.app_name}-api"
  protocol_type = "HTTP"

  cors_configuration {
    allow_origins = [
      "https://sprawdzamszlak.pl",
      "https://sprawdzamszlak.tlyko94.workers.dev",
      "http://localhost:3000",
    ]
    allow_methods = ["GET", "OPTIONS"]
    allow_headers = ["Content-Type"]
    max_age       = 3600
  }
}

resource "aws_apigatewayv2_integration" "lambda_integration" {
  api_id = aws_apigatewayv2_api.http_api.id

  integration_type = "AWS_PROXY"
  integration_uri  = aws_lambda_function.sprawdzamszlak_lambda.invoke_arn

  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "get_route" {
  api_id    = aws_apigatewayv2_api.http_api.id
  route_key = "GET /"
  target    = "integrations/${aws_apigatewayv2_integration.lambda_integration.id}"
}

resource "aws_apigatewayv2_route" "get_routes_route" {
  api_id    = aws_apigatewayv2_api.http_api.id
  route_key = "GET /routes"
  target    = "integrations/${aws_apigatewayv2_integration.lambda_integration.id}"
}

resource "aws_apigatewayv2_route" "get_strava_oauth_start" {
  api_id    = aws_apigatewayv2_api.http_api.id
  route_key = "GET /strava/oauth/start"
  target    = "integrations/${aws_apigatewayv2_integration.lambda_integration.id}"
}

resource "aws_apigatewayv2_route" "get_strava_oauth_callback" {
  api_id    = aws_apigatewayv2_api.http_api.id
  route_key = "GET /strava/oauth/callback"
  target    = "integrations/${aws_apigatewayv2_integration.lambda_integration.id}"
}

resource "aws_apigatewayv2_route" "get_strava_webhook" {
  api_id    = aws_apigatewayv2_api.http_api.id
  route_key = "GET /strava/webhook"
  target    = "integrations/${aws_apigatewayv2_integration.lambda_integration.id}"
}

resource "aws_apigatewayv2_route" "post_strava_webhook" {
  api_id    = aws_apigatewayv2_api.http_api.id
  route_key = "POST /strava/webhook"
  target    = "integrations/${aws_apigatewayv2_integration.lambda_integration.id}"
}

resource "aws_apigatewayv2_deployment" "main_deployment" {
  api_id = aws_apigatewayv2_api.http_api.id

  triggers = {
    redeployment_hash = md5(jsonencode([
      aws_apigatewayv2_route.get_route,
      aws_apigatewayv2_route.get_routes_route,
      aws_apigatewayv2_route.get_strava_oauth_start,
      aws_apigatewayv2_route.get_strava_oauth_callback,
      aws_apigatewayv2_route.get_strava_webhook,
      aws_apigatewayv2_route.post_strava_webhook,
      aws_apigatewayv2_integration.lambda_integration
    ]))
  }

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_cloudwatch_log_group" "api_gw_access" {
  name              = "/aws/apigateway/${local.app_name}-access"
  retention_in_days = 14
}

resource "aws_apigatewayv2_stage" "prod_stage" {
  api_id = aws_apigatewayv2_api.http_api.id
  name   = local.api_stage

  deployment_id = aws_apigatewayv2_deployment.main_deployment.id

  default_route_settings {
    throttling_burst_limit = 20
    throttling_rate_limit  = 10
  }

  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.api_gw_access.arn
    format = jsonencode({
      requestId               = "$context.requestId"
      ip                      = "$context.identity.sourceIp"
      requestTime             = "$context.requestTime"
      httpMethod              = "$context.httpMethod"
      routeKey                = "$context.routeKey"
      status                  = "$context.status"
      protocol                = "$context.protocol"
      responseLength          = "$context.responseLength"
      integrationErrorMessage = "$context.integrationErrorMessage"
    })
  }
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
