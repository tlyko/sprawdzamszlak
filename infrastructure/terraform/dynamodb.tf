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