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

  # Lambda — manage the API function and its log group
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
    resources = ["arn:aws:lambda:eu-west-1:214598715232:function:sprawdzamszlak-app"]
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

  # DynamoDB — the two app tables
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
      "arn:aws:dynamodb:eu-west-1:214598715232:table/sprawdzamszlak-data",
      "arn:aws:dynamodb:eu-west-1:214598715232:table/sprawdzamszlak-routes",
    ]
  }

  # S3 — the GeoJSON bucket
  statement {
    sid    = "S3App"
    effect = "Allow"
    actions = [
      "s3:CreateBucket",
      "s3:GetBucketAcl",
      "s3:GetBucketCors",
      "s3:GetBucketLocation",
      "s3:GetBucketLogging",
      "s3:GetBucketObjectLockConfiguration",
      "s3:GetBucketOwnershipControls",
      "s3:GetBucketPolicy",
      "s3:GetBucketPublicAccessBlock",
      "s3:GetBucketRequestPayment",
      "s3:GetBucketTagging",
      "s3:GetBucketVersioning",
      "s3:GetBucketWebsite",
      "s3:GetEncryptionConfiguration",
      "s3:GetLifecycleConfiguration",
      "s3:GetReplicationConfiguration",
      "s3:ListBucket",
      "s3:PutBucketCors",
      "s3:PutBucketPolicy",
      "s3:PutBucketPublicAccessBlock",
      "s3:PutBucketTagging",
      "s3:PutBucketVersioning",
      "s3:PutEncryptionConfiguration",
      "s3:PutLifecycleConfiguration",
      "s3:DeleteBucketPolicy",
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

  # CloudWatch Logs — both Lambda's log group and API GW access logs
  statement {
    sid    = "Logs"
    effect = "Allow"
    actions = [
      "logs:CreateLogGroup",
      "logs:DeleteLogGroup",
      "logs:DescribeLogGroups",
      "logs:PutRetentionPolicy",
      "logs:DeleteRetentionPolicy",
      "logs:TagResource",
      "logs:UntagResource",
      "logs:ListTagsForResource",
    ]
    resources = ["arn:aws:logs:eu-west-1:214598715232:log-group:*"]
  }

  # Cost Explorer + Budgets — global services for our cost monitoring
  statement {
    sid    = "CostMonitoring"
    effect = "Allow"
    actions = [
      "ce:GetAnomalyMonitors",
      "ce:GetAnomalySubscriptions",
      "ce:CreateAnomalyMonitor",
      "ce:CreateAnomalySubscription",
      "ce:UpdateAnomalyMonitor",
      "ce:UpdateAnomalySubscription",
      "ce:DeleteAnomalyMonitor",
      "ce:DeleteAnomalySubscription",
      "budgets:DescribeBudget",
      "budgets:CreateBudget",
      "budgets:ModifyBudget",
      "budgets:DeleteBudget",
      "budgets:DescribeBudgetAction",
      "budgets:ViewBudget",
    ]
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
