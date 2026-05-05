terraform {
  backend "s3" {
    bucket  = "sprawdzamszlak-tfstate-214598715232"
    key     = "sprawdzamszlak/terraform.tfstate"
    region  = "eu-west-1"
    encrypt = true

    # Replaces `dynamodb_table` (deprecated since TF 1.10). Locking now
    # uses an S3 .tflock object alongside the state file — same bucket,
    # zero extra infra. The DynamoDB locks table can be deleted by hand
    # after a few clean GHA runs.
    use_lockfile = true
  }

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "6.20.0"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "2.7.1"
    }
  }
}

provider "aws" {
  region = "eu-west-1"

  default_tags {
    tags = {
      ManagedBy = "Terraform"
      Project   = "sprawdzamszlak"
      Repo      = "https://github.com/tlyko/sprawdzamszlak"
    }
  }
}