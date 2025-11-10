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

resource "aws_dynamodb_table_item" "peaks" {
  for_each = local.peaks

  table_name = aws_dynamodb_table.sprawdzamszlak_table.name
  hash_key   = local.sprawdzamszlak_table.hash_key

  item = jsonencode(
    merge(
      # 1. Start with the "id" which is the key from the map
      { "id" = { "S" = each.key } },

      # 2. Add all other attributes from the map
      # This loop converts simple values like "nazwa" = "Giewont"
      # into DynamoDB format like "nazwa" = { "S" = "Giewont" }
      {
        for k, v in each.value : k => {
          # Use "N" (Number) for height, latitude, longitude, and "S" (String) for everything else
          (contains(["height", "latitude", "longitude"], k) ? "N" : "S") = tostring(v)
        }
      }
    )
  )
}

# This single resource creates all your route items
resource "aws_dynamodb_table_item" "routes" {
  for_each = local.routes

  table_name = aws_dynamodb_table.sprawdzamszlak_routes_table.name
  hash_key   = local.sprawdzamszlak_routes_table.hash_key

  item = jsonencode({
    "id"   = { "S" = each.key },
    "name" = { "S" = each.value.name },
    "type" = { "S" = each.value.type },
    
    # We dynamically construct the URL based on the bucket name and the filename
    "filename" = { "S" = each.value.filename }
  })
}