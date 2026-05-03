# CI/CD migration runbook (one-shot)

Order of operations to migrate from Terraform Cloud to S3+DDB backend + GitHub Actions OIDC. Run this **after** PR is merged into main, locally with active AWS SSO.

## Prerequisites
- `aws sso login` succeeded; `aws sts get-caller-identity` returns account `214598715232`
- Local main is up to date: `git checkout main && git pull`
- Latest TFC token still valid (we'll use it once for the migration)

## Step 1 — Bootstrap S3 + DDB

```bash
bash scripts/bootstrap-tfstate.sh
```

Idempotent. Creates the state bucket and lock table if missing.

## Step 2 — Migrate state from TFC to S3

```bash
cd infrastructure/terraform
terraform init -migrate-state
```

Terraform detects that `config.tf` swapped `cloud {}` → `backend "s3" {}` and prompts:

```
Do you want to copy existing state to the new backend? Enter "yes": yes
```

**Answer `yes`.** State moves from TFC into S3. The TFC workspace stays intact (untouched) until you delete it manually.

## Step 3 — Apply CI/CD resources

```bash
terraform plan
```

Expected: 3 to add (OIDC provider, IAM role, role policy attachment), maybe 1 in-place update on `default_tags` (Repo URL changed to monorepo).

```bash
terraform apply
```

After this, the role `arn:aws:iam::214598715232:role/sprawdzamszlak-gha-terraform` exists and is wired to the GitHub Actions OIDC provider. The `terraform output` will print the role ARN.

## Step 4 — First GHA-driven run

The workflow is on main once this PR is merged. Trigger it by pushing a small change (or wait for the next merge). It will:

1. Build apps/api Lambda bundle
2. `aws-actions/configure-aws-credentials` exchanges the OIDC token for the role
3. `terraform init` connects to S3 backend (no migration prompt — already done)
4. `terraform plan` shows no changes (idempotent against state set by step 3)
5. `terraform apply` runs but is a no-op

If the workflow fails on auth, the trust-policy `sub` claim doesn't match — check the role's `assume_role_policy` matches `repo:tlyko/sprawdzamszlak:ref:refs/heads/main`.

## Step 5 — Decommission TFC

In the Terraform Cloud dashboard:
1. Settings → Destruction & Deletion
2. Force-delete workspace `sprawdzamszlak-infrastructure`

The state in S3 is the source of truth from now on. The TFC workspace contains a stale snapshot of state from before step 2 — keep it for a week as a backup, then delete.

## Optional — add the W3 admin password secret

When you're ready to run W3 (admin panel + GPX upload), add the admin password to GitHub repo secrets:

1. Settings → Secrets and variables → Actions → New repository secret
2. Name: `TF_VAR_ADMIN_PASS`
3. Value: `openssl rand -base64 32` (save in 1Password too)

Without this secret, the workflow uses a placeholder password that won't authenticate any real admin requests; the Lambda will accept no admin operations until the secret is set.

## Rollback plan

If anything goes sideways at step 2 (state migration fails or partial):

- TFC workspace still has the original state. `cloud {}` block can be restored in `config.tf`, `terraform init -reconfigure` switches back.
- S3 state versioning means we can roll back individual state versions if needed.
- IAM role + OIDC provider are independent: they can be deleted manually from AWS Console without affecting app resources.
