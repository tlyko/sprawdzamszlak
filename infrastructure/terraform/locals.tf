locals {
  app_name    = "sprawdzamszlak-app"
  owner_email = "tlyko94@gmail.com"
  api_stage   = "prod"

  sprawdzamszlak_table = {
    name         = "sprawdzamszlak-data"
    billing_mode = "PAY_PER_REQUEST"
    hash_key     = "id"
    attributes = [
      {
        name = "id"
        type = "S"
      }
    ]
  }

  sprawdzamszlak_routes_table = {
    name         = "sprawdzamszlak-routes"
    billing_mode = "PAY_PER_REQUEST"
    hash_key     = "id"
    attributes = [
      {
        name = "id"
        type = "S"
      }
    ]
  }

  # Strava OAuth CSRF state (ADR-007). Single-use nonces with TTL = 10 min.
  strava_oauth_states_table = {
    name         = "sprawdzamszlak-strava-oauth-states"
    billing_mode = "PAY_PER_REQUEST"
    hash_key     = "state"
    attributes = [
      {
        name = "state"
        type = "S"
      }
    ]
  }

  # Strava webhook events (ADR-003 D2/D3). Idempotency table — conditional
  # PutItem on event_id drops Strava's retry duplicates. DDB Streams trigger
  # added in slice C drives the fetcher Lambda. TTL = 7 days for replay.
  strava_events_table = {
    name         = "sprawdzamszlak-strava-events"
    billing_mode = "PAY_PER_REQUEST"
    hash_key     = "event_id"
    attributes = [
      {
        name = "event_id"
        type = "S"
      }
    ]
  }

  # Planowane wyjścia (ADR-008). Owner-curated list of intended trips.
  # Hash key is a uuid v4 minted by the API; access patterns today are
  # all "list everything" (single-user scale ≤ ~50 rows), so no GSI.
  plans_table = {
    name         = "sprawdzamszlak-plans"
    billing_mode = "PAY_PER_REQUEST"
    hash_key     = "id"
    attributes = [
      {
        name = "id"
        type = "S"
      }
    ]
  }

  # `peaks = { … }` and `routes = { … }` maps removed in W2 (ADR-001).
  # Data lives in apps/api/seeds/*.json and is loaded via the seed script,
  # not by Terraform.
}
