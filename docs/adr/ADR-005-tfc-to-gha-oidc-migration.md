# ADR-005: Migrate from Terraform Cloud to GitHub Actions + AWS OIDC

**Date:** 2026-05-03
**Status:** Accepted
**Decision-maker:** Tomek (właściciel)

## Context

Until now Terraform state lived in Terraform Cloud (org `sprawdzamszlak-org`, workspace `sprawdzamszlak-infrastructure`). Apply ran locally against TFC remote state, with the owner manually running `terraform apply` from his machine after `aws sso login`.

Pain points that triggered this ADR:

- **Manual `terraform apply` after every merge** — drift between merged code and deployed state until owner remembers to apply.
- **TFC adds a third vendor** (AWS + Cloudflare + TFC) for a single-developer project — friction every time the TFC token expires (`unauthorized` failures we hit twice during W1).
- **TFC token rotation cost** — separate credential to manage.
- **OIDC for AWS access from CI** is a clean fit: short-lived role assumption, no long-lived secrets in GitHub.

## Decision

**Migrate from TFC to:**

- **State backend:** S3 + DynamoDB lock table, both in `eu-west-1` under the existing AWS account. Bucket: `sprawdzamszlak-tfstate-214598715232`. Lock table: `sprawdzamszlak-tfstate-locks`.
- **CI:** GitHub Actions workflow (`.github/workflows/terraform.yml`).
- **AWS auth from CI:** OIDC. AWS IAM has a single OIDC provider for `token.actions.githubusercontent.com`, plus a dedicated IAM role `sprawdzamszlak-gha-terraform` whose trust policy is scoped to `repo:tlyko/sprawdzamszlak:ref:refs/heads/main` (apply) and `repo:tlyko/sprawdzamszlak:pull_request` (plan-only).
- **TFC:** decommissioned after the cutover.

## Considered alternatives

### Option A — Stay on TFC, add GHA workflow that wraps `tfc-cli`

Workflow runs `terraform plan/apply` with `TF_API_TOKEN` from GH secret. TFC keeps state.

**Why not:** doesn't reduce vendor count or token-rotation cost; OIDC integration with TFC exists but adds a second OIDC layer (GHA → TFC → AWS). Strictly more moving parts.

### Option B — RECOMMENDED — GHA + S3+DDB backend + AWS OIDC

What this ADR proposes.

**Why:** removes TFC entirely, single-vendor for everything CI-related (AWS + GH), short-lived role assumption via OIDC means no long-lived AWS keys in GH.

### Option C — Run TF apply from a local pre-commit / Makefile target only

Skip CI entirely. The owner runs `make deploy` after merges.

**Why not:** owner explicitly asked to stop running it manually. Plus drift between merged code and deployed state until someone remembers to deploy.

## Rollout plan

1. **Bootstrap S3 + DDB lock table** out-of-band via `scripts/bootstrap-tfstate.sh` (aws cli, idempotent). The bootstrap can't itself live in TF — chicken and egg with the state backend.
2. **Reconfigure `config.tf`** — replace `cloud {}` block with `backend "s3" { ... }`.
3. **Migrate state** — `terraform init -migrate-state` copies the existing state from TFC into S3.
4. **Add OIDC provider + GHA role + IAM policy** in `infrastructure/terraform/cicd.tf`.
5. **Add `.github/workflows/terraform.yml`** — plan-on-PR, apply-on-merge-to-main.
6. **Add `TF_VAR_admin_pass` secret** in GitHub repo settings (when W3 lands).
7. **Decommission TFC** — delete the workspace in the TFC dashboard once a GHA-driven apply has succeeded once.

## Trust policy scoping

The GHA role's trust policy uses two conditions on `token.actions.githubusercontent.com`:

```jsonc
{
  "Effect": "Allow",
  "Principal": { "Federated": "arn:aws:iam::214598715232:oidc-provider/token.actions.githubusercontent.com" },
  "Action": "sts:AssumeRoleWithWebIdentity",
  "Condition": {
    "StringEquals": { "token.actions.githubusercontent.com:aud": "sts.amazonaws.com" },
    "StringLike": {
      "token.actions.githubusercontent.com:sub": [
        "repo:tlyko/sprawdzamszlak:ref:refs/heads/main",
        "repo:tlyko/sprawdzamszlak:pull_request"
      ]
    }
  }
}
```

`pull_request` subject pattern lets PR builds get the role; the workflow itself enforces plan-only on PRs (no `terraform apply` on the PR job, just `plan`). Apply runs only on the post-merge job that fires from `push` to `main` — the trust policy alone wouldn't block a malicious PR from running apply, but the workflow YAML does.

## IAM policy scope

Permissions are NOT `*:*`. The role can only touch what current Terraform actually manages:

- `lambda:*` and `iam:PassRole` for the Lambda function role
- `dynamodb:*` for the two app tables and the state lock table
- `s3:*` on `sprawdzamszlak-trails-storage-*`, `sprawdzamszlak-tfstate-*`
- `apigateway:*` (HTTP API operations are mixed Manage/Read)
- `iam:*` scoped to roles/policies whose names start with `sprawdzamszlak-`
- `logs:*` for the two log groups
- `ce:*` and `budgets:*` (Cost Explorer monitor + Budgets — both global services)
- `oidc-provider` self-management is **not** included; the OIDC provider is created once and never edited from this role.

Owner can audit the full policy in `infrastructure/terraform/cicd.tf`.

## Consequences

### Positive

- **Push to main → apply** automatically. Closes the "I forgot to apply" failure mode.
- One less vendor (TFC removed).
- Short-lived AWS credentials via OIDC; no `AWS_ACCESS_KEY_ID` ever stored in GH.
- Plan output posted as PR comment (existing convention from earlier feedback memory).

### Negative / risks

- **Bootstrap is fragile** — S3 bucket and DDB table for state must exist before any TF run, and the script that creates them is out of TF. Documented in `scripts/bootstrap-tfstate.sh` and README.
- **Lock contention** — if two simultaneous runs hit the same workspace, DDB lock blocks the second. Single-developer; not a real concern.
- **State migration is one-shot** — `terraform init -migrate-state` is interactive and prompts for confirmation. Mistake here = state loss; we keep TFC workspace as a backup until the first GHA apply succeeds.

### Mitigations

- Bootstrap script is idempotent (no-op if bucket/table exist).
- Migration step explicitly documented; the TFC workspace is left intact and only deleted manually after a clean GHA apply has run end-to-end.
- S3 bucket has versioning enabled — old state versions are recoverable for 30 days.

## Acceptance log

- 2026-05-03: Accepted. Trigger: incident during W2 where TFC token expired mid-deploy and the owner had to re-auth. Plus deadline pressure — automated apply removes one failure mode in W4-W5 (Strava integration deploys).
