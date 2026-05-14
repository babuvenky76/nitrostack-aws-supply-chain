# =============================================================================
# File: providers.tf
# Module: aws/supply-chain
# Purpose: AWS provider + default resource tags (Project, ManagedBy, Environment).
# Maintenance: Tags propagate to supported resources; adjust here for org tagging policy.
# =============================================================================

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = var.project_name
      ManagedBy   = "terraform"
      Environment = var.environment
    }
  }
}
