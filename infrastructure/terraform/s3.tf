data "aws_caller_identity" "current" {}

resource "aws_s3_bucket" "geojson_bucket" {
  bucket = "sprawdzamszlak-trails-storage-${data.aws_caller_identity.current.account_id}"
}

# This block now makes the bucket 100% private
resource "aws_s3_bucket_public_access_block" "geojson_bucket_public_access" {
  bucket = aws_s3_bucket.geojson_bucket.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}
