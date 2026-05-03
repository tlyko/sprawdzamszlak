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

  # `peaks = { … }` and `routes = { … }` maps removed in W2 (ADR-001).
  # Data lives in apps/api/seeds/*.json and is loaded via the seed script,
  # not by Terraform.
}
