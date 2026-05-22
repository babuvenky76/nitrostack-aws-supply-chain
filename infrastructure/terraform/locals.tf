# =============================================================================
# File: locals.tf
# Module: aws/supply-chain
# Purpose: Shared locals (account id, Cognito hosted UI domain prefix) + data sources.
# Maintenance: Domain must be globally unique per Cognito rules; override via var.cognito_domain_prefix.
# ResourceExpiryDate is anchored at first apply (time_static) + resource_expiry_days (default 30).
# =============================================================================

resource "time_static" "stack_anchor" {}

locals {
  caller                       = data.aws_caller_identity.current.account_id

  cognito_domain = coalesce(
    var.cognito_domain_prefix,
    "sc-${var.project_name}-${local.caller}"
  )

  iam_permissions_boundary_arn = coalesce(
    var.iam_permissions_boundary_arn,
    "arn:aws:iam::${local.caller}:policy/DevPermissionBoundaryBabuS"
  )

  stack_created_date = formatdate("YYYY-MM-DD", time_static.stack_anchor.rfc3339)

  resource_expiry_date = coalesce(
    var.resource_expiry_date,
    formatdate("YYYY-MM-DD", timeadd(time_static.stack_anchor.rfc3339, "${var.resource_expiry_days * 24}h"))
  )

  # Minimal tags on all resources (provider default_tags). API Gateway allows only [a-zA-Z+-=._:/].
  # User is required for aws:RequestTag/User in DevPermissionBabuS SSO policy.
  required_tags = {
    User               = var.owner_user
    Project            = var.project_name
    Application        = "nitrostack-supply-chain"
    Environment        = var.environment
    ManagedBy          = "terraform"
    AwsRegion          = var.aws_region
    CreatedDate        = local.stack_created_date
    ResourceExpiryDate = local.resource_expiry_date
  }

  # Extra tags on selected resources (DynamoDB, Lambda, etc.) — not duplicated on IAM roles.
  extended_tags = merge(local.required_tags, {
    Stack                = "supply-chain"
    WorkloadType         = "demo-reference"
    RepositoryPath       = "module-repos/aws/supply-chain"
    InfrastructureModule = "infrastructure/terraform"
    ContactOwner         = var.owner_user
    ResourceExpiryDays   = tostring(var.resource_expiry_days)
  })
}

data "aws_caller_identity" "current" {}

data "aws_region" "current" {}
