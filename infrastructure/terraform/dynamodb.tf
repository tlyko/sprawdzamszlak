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

  # Hardening (#4). SSE block makes the AWS-managed default explicit;
  # PITR + deletion_protection are real opt-in protections.
  deletion_protection_enabled = true

  server_side_encryption {
    enabled = true
  }

  point_in_time_recovery {
    enabled = true
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

  deletion_protection_enabled = true

  server_side_encryption {
    enabled = true
  }

  point_in_time_recovery {
    enabled = true
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

  # Hardening (#4). PITR skipped — items are 32-byte CSRF nonces with 10-min
  # TTL; restoring deleted ones has no value. del-prot still useful (the
  # table is a singleton and `terraform destroy` shouldn't ever wipe it).
  deletion_protection_enabled = true

  server_side_encryption {
    enabled = true
  }
}

resource "aws_dynamodb_table" "strava_events_table" {
  name         = local.strava_events_table.name
  billing_mode = local.strava_events_table.billing_mode
  hash_key     = local.strava_events_table.hash_key

  dynamic "attribute" {
    for_each = local.strava_events_table.attributes
    content {
      name = attribute.value.name
      type = attribute.value.type
    }
  }

  ttl {
    attribute_name = "expires_at"
    enabled        = true
  }

  # NEW_IMAGE so the slice-C fetcher Lambda can read the full event payload
  # off the stream without a DDB GetItem round-trip.
  stream_enabled   = true
  stream_view_type = "NEW_IMAGE"

  # Hardening (#4). Events are TTL'd to 7 days; PITR provides a recovery
  # window of similar shape but at any granularity within the 35-day backup.
  deletion_protection_enabled = true

  server_side_encryption {
    enabled = true
  }

  point_in_time_recovery {
    enabled = true
  }
}

# `aws_dynamodb_table_item` resources removed in W2 (ADR-001).
# Data is now seeded via `corepack pnpm -F api seed`, sourced from
# apps/api/seeds/peaks.json and apps/api/seeds/routes.json.
