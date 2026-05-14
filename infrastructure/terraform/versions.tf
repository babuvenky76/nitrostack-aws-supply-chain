# =============================================================================
# File: versions.tf
# Module: aws/supply-chain (NitroStack reference)
# Purpose: Terraform core version and provider pins (AWS, archive).
# Maintenance: After changing constraints run `terraform init -upgrade`.
# =============================================================================

terraform {
  required_version = ">= 1.5"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.82"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.4"
    }
  }
}
