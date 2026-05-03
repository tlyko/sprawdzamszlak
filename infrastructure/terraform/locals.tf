locals {
  app_name    = "sprawdzamszlak-app"
  owner_email = "tlyko94@gmail.com"

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

  # `peaks = { … }` and `routes = { … }` maps removed in W2 (ADR-001).
  # Data lives in apps/api/seeds/*.json and is loaded via the seed script,
  # not by Terraform.
}
