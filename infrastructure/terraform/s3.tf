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

resource "aws_s3_bucket_cors_configuration" "geojson_bucket_cors" {
  bucket = aws_s3_bucket.geojson_bucket.id

  cors_rule {
    allowed_headers = ["*"]

    allowed_methods = ["GET", "HEAD"]

    allowed_origins = [
      "https://sprawdzamszlak.pl",
      # Local dev — Next.js dev server (`pnpm -F sprawdzamszlak-frontend dev`)
      # serves on localhost:3000 and fetches presigned GeoJSON URLs as JSON,
      # which is CORS-checked. Without this entry trail overlay can't render
      # in dev. Same allowlist sits in the API GW cors_configuration.
      "http://localhost:3000",
    ]

    expose_headers  = []
    max_age_seconds = 3000
  }
  depends_on = [aws_s3_bucket_public_access_block.geojson_bucket_public_access]
}

# Hardening (#5). All four blocks make AWS-recommended defaults explicit
# and enforce them in IaC, so any future driftbot or console toggle gets
# corrected on the next terraform apply.

resource "aws_s3_bucket_server_side_encryption_configuration" "geojson_bucket_sse" {
  bucket = aws_s3_bucket.geojson_bucket.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
    # Bucket-key reduces KMS-key usage cost. With AES256 (S3-managed keys)
    # this is a no-op but harmless to declare.
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_versioning" "geojson_bucket_versioning" {
  bucket = aws_s3_bucket.geojson_bucket.id

  versioning_configuration {
    status = "Enabled"
  }
}

# Versioning above keeps every overwrite forever, which would let storage
# cost grow without bound (each Strava re-import rewrites the GeoJSON, the
# old version becomes a noncurrent object that nobody queries). 30 days is
# wide enough to recover from "I just nuked the wrong row" without paying
# for years-old artefacts. Audyt 2026-05-05 §5.4.
resource "aws_s3_bucket_lifecycle_configuration" "geojson_bucket_lifecycle" {
  bucket = aws_s3_bucket.geojson_bucket.id

  rule {
    id     = "expire-noncurrent-versions"
    status = "Enabled"

    filter {}

    noncurrent_version_expiration {
      noncurrent_days = 30
    }

    # Tidy up dangling multipart uploads so a failed PutObject doesn't
    # accumulate billing tail.
    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }

  depends_on = [aws_s3_bucket_versioning.geojson_bucket_versioning]
}

# BucketOwnerEnforced disables ACLs entirely; all access is via bucket
# policy + IAM. Recommended for new buckets since 2023.
resource "aws_s3_bucket_ownership_controls" "geojson_bucket_ownership" {
  bucket = aws_s3_bucket.geojson_bucket.id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

# Deny any request that isn't over TLS. Defense-in-depth on top of the
# fact that S3 endpoints already enforce HTTPS for SigV4-signed reads.
data "aws_iam_policy_document" "geojson_bucket_tls_only" {
  statement {
    sid     = "DenyInsecureTransport"
    effect  = "Deny"
    actions = ["s3:*"]
    resources = [
      aws_s3_bucket.geojson_bucket.arn,
      "${aws_s3_bucket.geojson_bucket.arn}/*",
    ]
    principals {
      type        = "*"
      identifiers = ["*"]
    }
    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}

resource "aws_s3_bucket_policy" "geojson_bucket_tls_only" {
  bucket = aws_s3_bucket.geojson_bucket.id
  policy = data.aws_iam_policy_document.geojson_bucket_tls_only.json

  depends_on = [aws_s3_bucket_public_access_block.geojson_bucket_public_access]
}