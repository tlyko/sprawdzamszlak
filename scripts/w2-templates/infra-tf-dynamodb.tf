resource "aws_dynamodb_table" "sprawdzamszlak_table" {
  name         = local.sprawdzamszlak_table.name
  billing_mode = local.sprawdzamszlak_table.billing_mode
  hash_key     = local.sprawdzamszlak_table.hash_key

  dynamic "attribute" {
    for_each = local.sprawdzamszlak_table.attributes
    content {
      name = attribute.value.name
      type = attribute.value.type
    }
  }
}

resource "aws_dynamodb_table" "sprawdzamszlak_routes_table" {
  name         = local.sprawdzamszlak_routes_table.name
  billing_mode = local.sprawdzamszlak_routes_table.billing_mode
  hash_key     = local.sprawdzamszlak_routes_table.hash_key

  dynamic "attribute" {
    for_each = local.sprawdzamszlak_routes_table.attributes
    content {
      name = attribute.value.name
      type = attribute.value.type
    }
  }
}

# `aws_dynamodb_table_item` resources removed in W2 (ADR-001).
# Data is now seeded via `corepack pnpm -F api seed`, sourced from
# apps/api/seeds/peaks.json and apps/api/seeds/routes.json.
