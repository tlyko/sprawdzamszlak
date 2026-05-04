# GitHub Actions OIDC integration — lets workflows in tlyko/sprawdzamszlak
# assume the dedicated `sprawdzamszlak-gha-terraform` role without any
# long-lived AWS credentials in GitHub secrets.
#
# Trust policy is scoped to:
#   - push to refs/heads/main          (apply)
#   - any pull_request event           (plan-only — workflow YAML enforces no-apply)
#
# Permission scope is documented in ADR-005. Roughly: just the resources
# this Terraform config actually manages, no wildcard *:*.

resource "aws_iam_openid_connect_provider" "github_actions" {
  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = ["6938fd4d98bab03faadb97b34396831e3780aea1"]
}

data "aws_iam_policy_document" "gha_terraform_trust" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github_actions.arn]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }

    condition {
      test     = "StringLike"
      variable = "token.actions.githubusercontent.com:sub"
      values = [
        "repo:tlyko/sprawdzamszlak:ref:refs/heads/main",
        "repo:tlyko/sprawdzamszlak:pull_request",
      ]
    }
  }
}

resource "aws_iam_role" "gha_terraform" {
  name               = "sprawdzamszlak-gha-terraform"
  assume_role_policy = data.aws_iam_policy_document.gha_terraform_trust.json
  description        = "Assumed by GitHub Actions in tlyko/sprawdzamszlak to run terraform plan/apply"
}

# ---------------------------------------------------------------------------
# Permissions
#
# Scoped to resources this Terraform config actually creates. NO wildcard
# *:*. Owner can audit by reading this policy document.
# ---------------------------------------------------------------------------

data "aws_iam_policy_document" "gha_terraform_perms" {
  # State backend access (S3 bucket + DDB lock table)
  statement {
    sid    = "TerraformStateBucket"
    effect = "Allow"
    actions = [
      "s3:GetObject",
      "s3:PutObject",
      "s3:DeleteObject",
      "s3:ListBucket",
      "s3:GetBucketVersioning",
    ]
    resources = [
      "arn:aws:s3:::sprawdzamszlak-tfstate-214598715232",
      "arn:aws:s3:::sprawdzamszlak-tfstate-214598715232/*",
    ]
  }

  statement {
    sid    = "TerraformStateLock"
    effect = "Allow"
    actions = [
      "dynamodb:GetItem",
      "dynamodb:PutItem",
      "dynamodb:DeleteItem",
      "dynamodb:DescribeTable",
    ]
    resources = ["arn:aws:dynamodb:eu-west-1:214598715232:table/sprawdzamszlak-tfstate-locks"]
  }

  # Lambda — manage all sprawdzamszlak Lambda functions and event source
  # mappings. Wildcard on the project prefix so adding a function (e.g.
  # the slice-C fetcher) doesn't require a CICD change.
  statement {
    sid    = "Lambda"
    effect = "Allow"
    actions = [
      "lambda:GetFunction",
      "lambda:CreateFunction",
      "lambda:UpdateFunctionCode",
      "lambda:UpdateFunctionConfiguration",
      "lambda:DeleteFunction",
      "lambda:GetFunctionConfiguration",
      "lambda:GetFunctionCodeSigningConfig",
      "lambda:ListVersionsByFunction",
      "lambda:GetPolicy",
      "lambda:AddPermission",
      "lambda:RemovePermission",
      "lambda:TagResource",
      "lambda:UntagResource",
      "lambda:ListTags",
    ]
    resources = ["arn:aws:lambda:eu-west-1:214598715232:function:sprawdzamszlak-*"]
  }

  # Event source mappings (DDB Streams → fetcher Lambda) are identified by
  # UUID, not by ARN, so resource-level scoping isn't possible. Tag actions
  # belong here because Lambda's tag API uses the same lambda:* verbs for
  # both functions and event source mappings, and Terraform refresh-time
  # ListTags on a mapping was failing without this.
  statement {
    sid    = "LambdaEventSourceMappings"
    effect = "Allow"
    actions = [
      "lambda:CreateEventSourceMapping",
      "lambda:GetEventSourceMapping",
      "lambda:UpdateEventSourceMapping",
      "lambda:DeleteEventSourceMapping",
      "lambda:ListEventSourceMappings",
      "lambda:ListTags",
      "lambda:TagResource",
      "lambda:UntagResource",
    ]
    resources = ["*"]
  }

  # IAM — only roles/policies/oidc-provider this project owns
  statement {
    sid    = "IamRoles"
    effect = "Allow"
    actions = [
      "iam:GetRole",
      "iam:CreateRole",
      "iam:UpdateRole",
      "iam:UpdateAssumeRolePolicy",
      "iam:DeleteRole",
      "iam:PassRole",
      "iam:GetRolePolicy",
      "iam:PutRolePolicy",
      "iam:DeleteRolePolicy",
      "iam:AttachRolePolicy",
      "iam:DetachRolePolicy",
      "iam:ListRolePolicies",
      "iam:ListAttachedRolePolicies",
      "iam:TagRole",
      "iam:UntagRole",
      "iam:ListInstanceProfilesForRole",
    ]
    resources = ["arn:aws:iam::214598715232:role/sprawdzamszlak-*"]
  }

  statement {
    sid    = "IamCustomerPolicies"
    effect = "Allow"
    actions = [
      "iam:GetPolicy",
      "iam:GetPolicyVersion",
      "iam:CreatePolicy",
      "iam:DeletePolicy",
      "iam:CreatePolicyVersion",
      "iam:DeletePolicyVersion",
      "iam:ListPolicyVersions",
      "iam:TagPolicy",
      "iam:UntagPolicy",
    ]
    resources = ["arn:aws:iam::214598715232:policy/sprawdzamszlak-*"]
  }

  statement {
    sid       = "IamOidcProviderRead"
    effect    = "Allow"
    actions   = ["iam:GetOpenIDConnectProvider"]
    resources = ["arn:aws:iam::214598715232:oidc-provider/token.actions.githubusercontent.com"]
  }

  # DynamoDB — all sprawdzamszlak app tables. Wildcard on the project prefix
  # so adding a table (e.g. strava-oauth-states, strava-events) doesn't
  # require a separate CICD change. The tfstate-locks table has narrower
  # actions covered by TerraformStateLock above.
  statement {
    sid    = "DynamoDB"
    effect = "Allow"
    actions = [
      "dynamodb:DescribeTable",
      "dynamodb:CreateTable",
      "dynamodb:DeleteTable",
      "dynamodb:UpdateTable",
      "dynamodb:DescribeContinuousBackups",
      "dynamodb:UpdateContinuousBackups",
      "dynamodb:DescribeTimeToLive",
      "dynamodb:UpdateTimeToLive",
      "dynamodb:TagResource",
      "dynamodb:UntagResource",
      "dynamodb:ListTagsOfResource",
    ]
    resources = [
      "arn:aws:dynamodb:eu-west-1:214598715232:table/sprawdzamszlak-*",
    ]
  }

  # S3 — the GeoJSON bucket. Wide Get*/List*/Put*/Delete* on bucket-level
  # operations is acceptable here because the resource pattern still pins
  # us to sprawdzamszlak-trails-storage-*. Object-level actions are not
  # needed by the Terraform config (the Lambda's own role does object reads).
  statement {
    sid    = "S3App"
    effect = "Allow"
    actions = [
      "s3:CreateBucket",
      "s3:DeleteBucket",
      "s3:Get*",
      "s3:List*",
      "s3:Put*",
      "s3:DeleteBucketPolicy",
      "s3:DeleteBucketCors",
      "s3:DeleteBucketTagging",
    ]
    resources = ["arn:aws:s3:::sprawdzamszlak-trails-storage-*"]
  }

  # API Gateway HTTP API
  statement {
    sid    = "ApiGateway"
    effect = "Allow"
    actions = [
      "apigateway:GET",
      "apigateway:POST",
      "apigateway:PUT",
      "apigateway:PATCH",
      "apigateway:DELETE",
    ]
    resources = ["*"]
  }

  # CloudWatch Logs — both Lambda's log group and API GW access logs.
  # Wide on log-group operations under the project resource pattern; cheap
  # safety against the next "ListTagsFor*"-style refresh action.
  statement {
    sid       = "Logs"
    effect    = "Allow"
    actions   = ["logs:*"]
    resources = ["arn:aws:logs:eu-west-1:214598715232:log-group:*"]
  }

  # API GW access-logging requires logs:CreateLogDelivery (and friends),
  # which are global actions and only support resource "*" — they cannot
  # be scoped to a single log group ARN. Stage modifications fail without
  # this when AWS re-validates the access_log_settings configuration.
  statement {
    sid    = "LogsDelivery"
    effect = "Allow"
    actions = [
      "logs:CreateLogDelivery",
      "logs:GetLogDelivery",
      "logs:UpdateLogDelivery",
      "logs:DeleteLogDelivery",
      "logs:ListLogDeliveries",
      "logs:DescribeResourcePolicies",
      "logs:PutResourcePolicy",
    ]
    resources = ["*"]
  }

  # Cost Explorer + Budgets — global services. Wide ce:*/budgets:* is
  # acceptable; this account isn't shared, and these services don't manage
  # other workloads. Narrowing wastes time chasing the next ListTagsFor*
  # action that isn't on our allowlist.
  statement {
    sid       = "CostMonitoring"
    effect    = "Allow"
    actions   = ["ce:*", "budgets:*"]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "gha_terraform_perms" {
  name   = "sprawdzamszlak-gha-terraform-perms"
  role   = aws_iam_role.gha_terraform.id
  policy = data.aws_iam_policy_document.gha_terraform_perms.json
}

output "gha_role_arn" {
  description = "ARN of the role GitHub Actions assumes via OIDC. Used in .github/workflows/terraform.yml"
  value       = aws_iam_role.gha_terraform.arn
}
