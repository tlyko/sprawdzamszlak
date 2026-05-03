terraform {
  backend "s3" {
    bucket         = "sprawdzamszlak-tfstate-214598715232"
    key            = "sprawdzamszlak/terraform.tfstate"
    region         = "eu-west-1"
    dynamodb_table = "sprawdzamszlak-tfstate-locks"
    encrypt        = true
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