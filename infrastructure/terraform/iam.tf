
data "aws_iam_policy_document" "sprawdzamszlak_db_policy_doc" {
  statement {
    sid    = "AllowAppToAccessTable"
    effect = "Allow"

    actions = [
      "dynamodb:GetItem",
      "dynamodb:PutItem",
      "dynamodb:UpdateItem",
      "dynamodb:DeleteItem",
      "dynamodb:Query",
      "dynamodb:Scan"
    ]

    resources = [
      aws_dynamodb_table.sprawdzamszlak_table.arn,
      aws_dynamodb_table.sprawdzamszlak_routes_table.arn,
      aws_dynamodb_table.strava_oauth_states_table.arn,
      aws_dynamodb_table.strava_events_table.arn,
      aws_dynamodb_table.plans_table.arn,
    ]
  }

  statement {
    sid    = "AllowAppToReadGeoJSON"
    effect = "Allow"
    actions = [
      "s3:GetObject",
    ]
    resources = [
      "${aws_s3_bucket.geojson_bucket.arn}/trails/*",
    ]
  }

  # Slice C: fetcher Lambda writes new strava-imported routes as
  # trails/strava_{activity_id}.geojson. Limited to PutObject so the role
  # can never delete or list bucket contents.
  statement {
    sid    = "AllowFetcherToWriteGeoJSON"
    effect = "Allow"
    actions = [
      "s3:PutObject",
    ]
    resources = [
      "${aws_s3_bucket.geojson_bucket.arn}/trails/*",
    ]
  }

  # Slice C: fetcher Lambda is triggered by the DDB Stream on the
  # strava-events table (NEW_IMAGE). These actions don't act on the table
  # itself, only on its stream — scoped to that one stream ARN.
  statement {
    sid    = "AllowFetcherToConsumeEventsStream"
    effect = "Allow"
    actions = [
      "dynamodb:DescribeStream",
      "dynamodb:GetRecords",
      "dynamodb:GetShardIterator",
      "dynamodb:ListStreams",
    ]
    resources = [
      aws_dynamodb_table.strava_events_table.stream_arn,
    ]
  }

  # ADR-007: Lambda reads owner-managed Strava credentials (client_id,
  # client_secret, verify_token) from Parameter Store and writes the
  # access/refresh token tuple it receives from Strava. Verify_token has
  # write scope too — `pnpm strava:subscribe` uploads it via Lambda for
  # consistency with how it gets read at webhook handshake time.
  #
  # ADR-008: also reads CF Access config (team_domain, aud) and the owner
  # email allowlist for /admin/* JWT verification. None of these are
  # secrets per se — but staying inside Parameter Store keeps the env
  # surface clean and lets owner rotate without redeploy.
  statement {
    sid     = "AllowAppToReadConfigParams"
    effect  = "Allow"
    actions = ["ssm:GetParameter", "ssm:GetParameters"]
    resources = [
      "arn:aws:ssm:eu-west-1:${data.aws_caller_identity.current.account_id}:parameter/sprawdzamszlak/strava/*",
      "arn:aws:ssm:eu-west-1:${data.aws_caller_identity.current.account_id}:parameter/sprawdzamszlak/cf-access/*",
      "arn:aws:ssm:eu-west-1:${data.aws_caller_identity.current.account_id}:parameter/sprawdzamszlak/admin/*",
    ]
  }

  statement {
    sid     = "AllowAppToWriteStravaTokens"
    effect  = "Allow"
    actions = ["ssm:PutParameter"]
    resources = [
      "arn:aws:ssm:eu-west-1:${data.aws_caller_identity.current.account_id}:parameter/sprawdzamszlak/strava/tokens",
    ]
  }
}

resource "aws_iam_policy" "sprawdzamszlak_db_policy" {
  name        = "${local.app_name}-db-access-policy"
  description = "Allows read/write access to the sprawdzamszlak-data table"
  policy      = data.aws_iam_policy_document.sprawdzamszlak_db_policy_doc.json
}

data "aws_iam_policy_document" "lambda_trust_policy_doc" {
  statement {
    effect = "Allow"
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
    actions = ["sts:AssumeRole"]
  }
}
resource "aws_iam_role" "sprawdzamszlak_app_role" {
  name               = "${local.app_name}-role"
  description        = "IAM Role for the sprawdzamszlak application (Lambda)"
  assume_role_policy = data.aws_iam_policy_document.lambda_trust_policy_doc.json
}

resource "aws_iam_role_policy_attachment" "db_policy_attachment" {
  role       = aws_iam_role.sprawdzamszlak_app_role.name
  policy_arn = aws_iam_policy.sprawdzamszlak_db_policy.arn
}

resource "aws_iam_role_policy_attachment" "lambda_logging_attachment" {
  role       = aws_iam_role.sprawdzamszlak_app_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}