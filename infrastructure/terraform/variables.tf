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
