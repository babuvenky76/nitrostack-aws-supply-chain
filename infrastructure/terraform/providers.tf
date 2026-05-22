# =============================================================================
# File: providers.tf
# Module: aws/supply-chain
# Purpose: AWS provider + default resource tags (incl. User=babus for SSO IAM policy).
# Maintenance: Tags propagate to supported resources; see locals.common_tags in locals.tf.
# =============================================================================

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = local.required_tags
  }
}

# IAM roles: avoid default_tags merge (extra TagRole calls). SSO policy requires User=babus on create.
provider "aws" {
  alias  = "iam_roles"
  region = var.aws_region
}
