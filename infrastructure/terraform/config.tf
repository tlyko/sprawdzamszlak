terraform {
  required_providers {
    aws = {
      source = "hashicorp/aws"
      version = "6.20.0"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "2.7.1"
    }
  }

    backend "s3" {
        bucket  = "tfstate-214598715232-eu-west-1"
        key     = "sprawdzamszlak-infrastructure/terraform.tfstate"
        region  = "eu-west-1"
        encrypt = true
    }
}

provider "aws" {
  region = "eu-west-1"
  profile = "default" 
    default_tags {
        tags = {
        Project     = "sprawdzamszlak"
        ManagedBy   = "Terraform"
        Repo        = "https://github.com/tlyko/sprawdzamszlak-infrastructure"
        }
    }
}