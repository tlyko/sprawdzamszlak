#!/usr/bin/env bash
# One-shot bootstrap for Terraform state backend on AWS.
# Creates an S3 bucket + DynamoDB lock table that this project will use
# as its remote backend (replacing Terraform Cloud).
#
# Idempotent: re-running on an already-bootstrapped account is a no-op.
#
# Run with active AWS SSO session (aws sts get-caller-identity must work):
#   aws sso login
#   bash scripts/bootstrap-tfstate.sh

set -euo pipefail

REGION="eu-west-1"
ACCOUNT_ID="214598715232"
BUCKET="sprawdzamszlak-tfstate-${ACCOUNT_ID}"
LOCK_TABLE="sprawdzamszlak-tfstate-locks"

green()  { printf "\033[32m%s\033[0m\n" "$*"; }
yellow() { printf "\033[33m%s\033[0m\n" "$*"; }
red()    { printf "\033[31m%s\033[0m\n" "$*" >&2; }
step()   { printf "\n\033[1;36m==> %s\033[0m\n" "$*"; }

step "0. Sanity"

aws sts get-caller-identity --query Account --output text >/dev/null \
  || { red "AWS CLI not authenticated. Run: aws sso login"; exit 1; }

CURRENT_ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
if [ "$CURRENT_ACCOUNT" != "$ACCOUNT_ID" ]; then
  red "Active AWS account is $CURRENT_ACCOUNT, expected $ACCOUNT_ID."
  exit 1
fi
green "Authenticated as account $ACCOUNT_ID"

step "1. S3 bucket: $BUCKET"

if aws s3api head-bucket --bucket "$BUCKET" --region "$REGION" 2>/dev/null; then
  yellow "  Bucket already exists — skipping create"
else
  aws s3api create-bucket \
    --bucket "$BUCKET" \
    --region "$REGION" \
    --create-bucket-configuration "LocationConstraint=$REGION"
  green "  Created"
fi

aws s3api put-bucket-versioning \
  --bucket "$BUCKET" \
  --versioning-configuration Status=Enabled
green "  Versioning enabled"

aws s3api put-bucket-encryption \
  --bucket "$BUCKET" \
  --server-side-encryption-configuration '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"},"BucketKeyEnabled":true}]}'
green "  SSE-S3 enforced"

aws s3api put-public-access-block \
  --bucket "$BUCKET" \
  --public-access-block-configuration '{"BlockPublicAcls":true,"IgnorePublicAcls":true,"BlockPublicPolicy":true,"RestrictPublicBuckets":true}'
green "  Public access blocked"

POLICY_JSON='{"Version":"2012-10-17","Statement":[{"Sid":"DenyInsecureTransport","Effect":"Deny","Principal":"*","Action":"s3:*","Resource":["arn:aws:s3:::'$BUCKET'","arn:aws:s3:::'$BUCKET'/*"],"Condition":{"Bool":{"aws:SecureTransport":"false"}}}]}'
aws s3api put-bucket-policy --bucket "$BUCKET" --policy "$POLICY_JSON"
green "  TLS-only policy applied"

step "2. DynamoDB lock table: $LOCK_TABLE"

if aws dynamodb describe-table --table-name "$LOCK_TABLE" --region "$REGION" >/dev/null 2>&1; then
  yellow "  Table already exists — skipping create"
else
  aws dynamodb create-table \
    --table-name "$LOCK_TABLE" \
    --region "$REGION" \
    --attribute-definitions AttributeName=LockID,AttributeType=S \
    --key-schema AttributeName=LockID,KeyType=HASH \
    --billing-mode PAY_PER_REQUEST \
    --tags Key=ManagedBy,Value=bootstrap-script Key=Project,Value=sprawdzamszlak >/dev/null
  yellow "  Waiting for table to become ACTIVE..."
  aws dynamodb wait table-exists --table-name "$LOCK_TABLE" --region "$REGION"
  green "  Created"
fi

aws dynamodb update-continuous-backups \
  --table-name "$LOCK_TABLE" \
  --region "$REGION" \
  --point-in-time-recovery-specification PointInTimeRecoveryEnabled=true >/dev/null 2>&1 || true
green "  PITR enabled (best-effort)"

green ""
green "============================================="
green "Bootstrap complete."
green "============================================="
green ""
green "Next: replace the cloud {} block in infrastructure/terraform/config.tf with:"
green ""
echo "  backend \"s3\" {"
echo "    bucket         = \"$BUCKET\""
echo "    key            = \"sprawdzamszlak/terraform.tfstate\""
echo "    region         = \"$REGION\""
echo "    dynamodb_table = \"$LOCK_TABLE\""
echo "    encrypt        = true"
echo "  }"
green ""
green "Then in infrastructure/terraform/:"
green "  terraform init -migrate-state    # confirm 'yes' to copy state from TFC"
