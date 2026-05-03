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

resource "aws_dynamodb_table" "strava_oauth_states_table" {
  name         = local.strava_oauth_states_table.name
  billing_mode = local.strava_oauth_states_table.billing_mode
  hash_key     = local.strava_oauth_states_table.hash_key

  dynamic "attribute" {
    for_each = local.strava_oauth_states_table.attributes
    content {
      name = attribute.value.name
      type = attribute.value.type
    }
  }

  ttl {
    attribute_name = "expires_at"
    enabled        = true
  }
}

# `aws_dynamodb_table_item` resources removed in W2 (ADR-001).
# Data is now seeded via `corepack pnpm -F api seed`, sourced from
# apps/api/seeds/peaks.json and apps/api/seeds/routes.json.
