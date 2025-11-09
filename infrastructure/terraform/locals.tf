locals {
  sprawdzamszlak_table = {
    name         = "sprawdzamszlak-data"
    billing_mode = "PAY_PER_REQUEST"
    hash_key     = "id"
    attributes = [
      {
        name = "id"
        type = "S" # S = String
      }
    ]
  }
}