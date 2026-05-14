# =============================================================================
# File: cognito.tf
# Module: aws/supply-chain
# Purpose: User pool, resource server + scopes, web (PKCE) and MCP (client credentials) app clients, domain.
# Maintenance: MCP client has generate_secret=true — secret value lives in Secrets Manager JSON (secrets.tf).
# =============================================================================

resource "aws_cognito_user_pool" "main" {
  name = "${var.project_name}-supply-chain-users"

  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]

  admin_create_user_config {
    allow_admin_create_user_only = false
  }

  password_policy {
    minimum_length                   = 8
    require_lowercase                = true
    require_numbers                  = true
    require_symbols                  = false
    require_uppercase                = true
    temporary_password_validity_days = 7
  }
}

resource "aws_cognito_resource_server" "supply_chain" {
  identifier   = "supply-chain"
  name         = "supply-chain"
  user_pool_id = aws_cognito_user_pool.main.id

  scope {
    scope_name        = "order.read"
    scope_description = "Read catalog and orders"
  }

  scope {
    scope_name        = "order.write"
    scope_description = "Create or cancel orders"
  }
}

resource "aws_cognito_user_pool_client" "web" {
  name         = "${var.project_name}-web-public"
  user_pool_id = aws_cognito_user_pool.main.id

  generate_secret                      = false
  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_flows                  = ["code"]
  allowed_oauth_scopes = [
    "openid",
    "email",
    "supply-chain/order.read",
    "supply-chain/order.write",
  ]

  callback_urls = var.cognito_callback_urls
  logout_urls   = var.cognito_logout_urls

  supported_identity_providers  = ["COGNITO"]
  prevent_user_existence_errors = "ENABLED"
  enable_token_revocation       = true

  explicit_auth_flows = [
    "ALLOW_REFRESH_TOKEN_AUTH",
    "ALLOW_USER_SRP_AUTH",
  ]

  depends_on = [aws_cognito_resource_server.supply_chain]
}

resource "aws_cognito_user_pool_client" "mcp" {
  name         = "${var.project_name}-mcp-machine"
  user_pool_id = aws_cognito_user_pool.main.id

  generate_secret                      = true
  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_flows                  = ["client_credentials"]
  allowed_oauth_scopes = [
    "supply-chain/order.read",
    "supply-chain/order.write",
  ]

  depends_on = [aws_cognito_resource_server.supply_chain]
}

resource "aws_cognito_user_pool_domain" "main" {
  domain       = local.cognito_domain
  user_pool_id = aws_cognito_user_pool.main.id
}
