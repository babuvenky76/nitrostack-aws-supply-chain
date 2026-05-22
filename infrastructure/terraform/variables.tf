# =============================================================================
# File: variables.tf
# Module: aws/supply-chain
# Purpose: Input variables (region, project_name, Cognito URLs, CORS, environment).
# Maintenance: Changing project_name renames many resources; plan carefully in non-dev accounts.
# =============================================================================

variable "aws_region" {
  type        = string
  description = "AWS region for all regional resources."
  default     = "us-east-2"
}

variable "project_name" {
  type        = string
  description = "Short name used in resource names and tags. Secrets Manager app secret becomes {project_name}/nitrostack-app (must match scripts default if you do not use .generated/.env)."
  default     = "nsupply"

  validation {
    condition     = can(regex("^[a-z0-9-]{3,32}$", var.project_name))
    error_message = "project_name must be 3-32 chars: lowercase letters, digits, hyphen."
  }
}

variable "environment" {
  type        = string
  description = "Deployment stage label (tags + optional naming)."
  default     = "dev"
}

variable "owner_user" {
  type        = string
  description = "Owner username for aws:RequestTag/User (required by DevPermissionBabuS SSO inline policy)."
  default     = "babus"

  validation {
    condition     = can(regex("^[a-z0-9._-]{2,32}$", var.owner_user))
    error_message = "owner_user must be 2-32 chars: lowercase letters, digits, dot, underscore, hyphen."
  }
}

variable "iam_permissions_boundary_arn" {
  type        = string
  description = "IAM permissions boundary ARN for Lambda execution roles (required by DevPermissionBabuS on iam:CreateRole)."
  default     = null
}

variable "resource_expiry_days" {
  type        = number
  description = "Days until ResourceExpiryDate tag (default 30 = one month)."
  default     = 30

  validation {
    condition     = var.resource_expiry_days >= 1 && var.resource_expiry_days <= 365
    error_message = "resource_expiry_days must be between 1 and 365."
  }
}

variable "resource_expiry_date" {
  type        = string
  description = "Optional override for expiry tag (YYYY-MM-DD). If unset, CreatedDate + resource_expiry_days."
  default     = null

  validation {
    condition     = var.resource_expiry_date == null || can(regex("^\\d{4}-\\d{2}-\\d{2}$", var.resource_expiry_date))
    error_message = "resource_expiry_date must be YYYY-MM-DD or null."
  }
}

variable "cognito_domain_prefix" {
  type        = string
  description = "Cognito hosted UI domain prefix (must be globally unique). Defaults to sc-{project}-{account_id}."
  default     = null
}

variable "cognito_callback_urls" {
  type        = list(string)
  description = "Allowed OAuth callback URLs for the web app client."
  default = [
    "http://localhost:5174/",
    "http://127.0.0.1:5174/",
  ]
}

variable "cognito_logout_urls" {
  type        = list(string)
  description = "Allowed logout URLs for the web app client."
  default = [
    "http://localhost:5174/",
    "http://127.0.0.1:5174/",
  ]
}

variable "cors_allow_origins" {
  type        = list(string)
  description = "CORS allow_origins for the HTTP API."
  default = [
    "http://localhost:5174",
    "http://127.0.0.1:5174",
  ]
}
