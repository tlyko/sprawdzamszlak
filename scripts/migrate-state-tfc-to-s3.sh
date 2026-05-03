#!/usr/bin/env bash
# One-shot migration of Terraform state from Terraform Cloud to S3 backend.
#
# Why this exists: `terraform init -migrate-state` does NOT support
# migrating away from `cloud {}` block (HCP Terraform). The supported
# flow is manual: pull state with cloud{} active, swap backend, push
# state to the new backend.
#
# This script does that swap idempotently. Re-running on an already-
# migrated workspace is a no-op (detects state in S3 and exits).
#
# Run from monorepo root with active AWS SSO + TFC token in
# ~/.terraform.d/credentials.tfrc.json:
#   bash scripts/migrate-state-tfc-to-s3.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TF_DIR="$ROOT/infrastructure/terraform"
STATE_FILE="/tmp/sprawdzamszlak-tfstate-$(date +%Y%m%d-%H%M%S).tfstate"
CONFIG="$TF_DIR/config.tf"
CONFIG_BACKUP="/tmp/config.tf.s3-backend.backup"

REGION="eu-west-1"
BUCKET="sprawdzamszlak-tfstate-214598715232"
KEY="sprawdzamszlak/terraform.tfstate"

green()  { printf "\033[32m%s\033[0m\n" "$*"; }
yellow() { printf "\033[33m%s\033[0m\n" "$*"; }
red()    { printf "\033[31m%s\033[0m\n" "$*" >&2; }
step()   { printf "\n\033[1;36m==> %s\033[0m\n" "$*"; }

cd "$TF_DIR"

# ---------------------------------------------------------------------------
step "0. Sanity"
# ---------------------------------------------------------------------------

aws sts get-caller-identity --query Account --output text >/dev/null \
  || { red "AWS not authenticated. Run: aws sso login"; exit 1; }

# Already-migrated detection: if S3 has the state object, abort.
if aws s3api head-object --bucket "$BUCKET" --key "$KEY" --region "$REGION" 2>/dev/null; then
  yellow "S3 already has state at s3://$BUCKET/$KEY — migration already done."
  yellow "If this is wrong, delete the object manually and re-run."
  exit 0
fi
green "S3 backend empty — migration is needed."

# Sanity: config.tf currently has backend "s3" (post-merge state)
if ! grep -q 'backend "s3"' "$CONFIG"; then
  red "$CONFIG doesn't have backend \"s3\". This script expects post-merge state."
  exit 1
fi

# Sanity: no .terraform/ left from S3 attempt
if [ -d "$TF_DIR/.terraform" ]; then
  yellow "Removing existing .terraform/ to start clean."
  rm -rf "$TF_DIR/.terraform" "$TF_DIR/.terraform.lock.hcl"
fi

# ---------------------------------------------------------------------------
step "1. Backup current backend \"s3\" block, swap to cloud{} temporarily"
# ---------------------------------------------------------------------------

cp "$CONFIG" "$CONFIG_BACKUP"
green "  config.tf saved to $CONFIG_BACKUP"

# Replace the s3 backend block with the original cloud{} block. We do this
# in-place; restored at the end.
python3 - "$CONFIG" <<'PY'
import sys
from pathlib import Path

p = Path(sys.argv[1])
text = p.read_text()

s3_block = """  backend "s3" {
    bucket         = "sprawdzamszlak-tfstate-214598715232"
    key            = "sprawdzamszlak/terraform.tfstate"
    region         = "eu-west-1"
    dynamodb_table = "sprawdzamszlak-tfstate-locks"
    encrypt        = true
  }"""

cloud_block = """  cloud {
    organization = "sprawdzamszlak-org"
    workspaces {
      name = "sprawdzamszlak-infrastructure"
    }
  }"""

if s3_block not in text:
    raise SystemExit("Could not find s3 backend block to swap; aborting.")

text = text.replace(s3_block, cloud_block)
p.write_text(text)
print("  Swapped backend \"s3\" → cloud {} in config.tf")
PY

# ---------------------------------------------------------------------------
step "2. terraform init against TFC"
# ---------------------------------------------------------------------------

cd "$TF_DIR"
terraform init -input=false 2>&1 | tail -10

# ---------------------------------------------------------------------------
step "3. Pull state from TFC"
# ---------------------------------------------------------------------------

terraform state pull > "$STATE_FILE"
SIZE=$(wc -c < "$STATE_FILE")
green "  Pulled $SIZE bytes to $STATE_FILE"

if [ "$SIZE" -lt 1000 ]; then
  red "State file looks suspiciously small. Aborting before damage."
  exit 1
fi

# ---------------------------------------------------------------------------
step "4. Swap config.tf back to backend \"s3\""
# ---------------------------------------------------------------------------

cp "$CONFIG_BACKUP" "$CONFIG"
green "  config.tf restored to backend \"s3\""

rm -rf .terraform .terraform.lock.hcl

# ---------------------------------------------------------------------------
step "5. terraform init against S3"
# ---------------------------------------------------------------------------

terraform init -input=false 2>&1 | tail -10

# ---------------------------------------------------------------------------
step "6. Push state to S3"
# ---------------------------------------------------------------------------

terraform state push "$STATE_FILE"
green "  State pushed to s3://$BUCKET/$KEY"

# ---------------------------------------------------------------------------
step "7. Verify"
# ---------------------------------------------------------------------------

terraform state list | head -10
echo "  ..."
COUNT=$(terraform state list | wc -l | tr -d ' ')
green "  $COUNT resources tracked in S3 state"

green ""
green "==========================================="
green "Migration complete."
green "==========================================="
green ""
green "Next:"
green "  terraform plan      # expect 3 to add (oidc_provider, role, role_policy)"
green "  terraform apply     # apply OIDC + GHA role"
green ""
green "Then in TFC dashboard, force-delete the workspace 'sprawdzamszlak-infrastructure'"
green "AFTER you've verified terraform plan/apply works against S3."
green ""
green "Local backup of pulled state: $STATE_FILE"
green "(Delete after a few days when you're confident)"
