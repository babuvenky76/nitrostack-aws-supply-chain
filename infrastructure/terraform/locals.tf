# =============================================================================
# File: locals.tf
# Module: aws/supply-chain
# Purpose: Shared locals (account id, Cognito hosted UI domain prefix) + data sources.
# Maintenance: Domain must be globally unique per Cognito rules; override via var.cognito_domain_prefix.
# =============================================================================

locals {
  caller                       = data.aws_caller_identity.current.account_id
  owner_tag_user               = "babus"
  iam_permissions_boundary_arn = "arn:aws:iam::497458935261:policy/DevPermissionBoundaryBabuS"

  cognito_domain = coalesce(
    var.cognito_domain_prefix,
    "sc-${var.project_name}-${local.caller}"
  )
}

data "aws_caller_identity" "current" {}

data "aws_region" "current" {}
