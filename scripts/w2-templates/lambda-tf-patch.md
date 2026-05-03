# lambda.tf — W2 patch

The W2 bootstrap script does an in-place edit of `infrastructure/terraform/lambda.tf`. The changes are:

## 1. Replace `data "archive_file" "lambda_zip"` source_dir

```hcl
# BEFORE
data "archive_file" "lambda_zip" {
  type        = "zip"
  source_dir  = "${path.module}/src"
  output_path = "${path.module}/dist/lambda.zip"
}

# AFTER
data "archive_file" "lambda_zip" {
  type        = "zip"
  source_dir  = "${path.module}/../../apps/api/dist"
  output_path = "${path.module}/dist/lambda.zip"
}
```

## 2. Update `aws_lambda_function.sprawdzamszlak_lambda`

```hcl
# BEFORE
handler = "lambda_function.lambda_handler"
runtime = "python3.13"

# AFTER
handler = "handler.handler"
runtime = "nodejs22.x"
```

## 3. Drop the now-empty `infrastructure/terraform/src/`

The Python source is preserved in git history; the working tree no longer needs it because the Lambda zip is built from `apps/api/dist/` instead.

## 4. Drop the Terraform-managed `aws_dynamodb_table_item.peaks` and `.routes`

`dynamodb.tf` had inline `for_each = local.peaks` and `for_each = local.routes` writing items into the tables. Replace with a one-time seed run via `corepack pnpm -F api seed`.

```hcl
# DELETE these resources from dynamodb.tf:
#   resource "aws_dynamodb_table_item" "peaks"   { ... }
#   resource "aws_dynamodb_table_item" "routes"  { ... }
```

The matching maps in `locals.tf` (`peaks = { … }` and `routes = { … }`, ~280 lines) can also be deleted now — data lives in `apps/api/seeds/*.json`.

## 5. Plan summary expectations

After these edits and the build (`corepack pnpm -F api build`), `terraform plan` should show:

- `aws_lambda_function.sprawdzamszlak_lambda` — in-place update (handler, runtime, source_code_hash all change)
- `data.archive_file.lambda_zip` — re-read at apply (different source_dir)
- `aws_dynamodb_table_item.peaks[*]` — destroy 24
- `aws_dynamodb_table_item.routes[*]` — destroy 12

The 36 destroys are removals from Terraform's *state* — the rows themselves stay in DDB until the seed script overwrites them. **Run `pnpm -F api seed` BEFORE `terraform apply`** to be safe.

Order:
1. `corepack pnpm -F api build`
2. `corepack pnpm -F api seed`        ← rows now also in DDB outside Terraform's view
3. `terraform plan`
4. Review
5. `terraform apply`                  ← removes Terraform's tracking, but data persists; Lambda swaps to TS bundle
