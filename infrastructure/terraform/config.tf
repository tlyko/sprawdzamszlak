terraform {
  cloud {
    organization = "sprawdzamszlak-org"
    workspaces {
      name = "sprawdzamszlak-infrastructure"
    }
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
}