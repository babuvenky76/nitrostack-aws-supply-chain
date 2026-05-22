# =============================================================================
# File: outputs.tf
# Module: aws/supply-chain
# Purpose: Exported values for scripts (.generated/.env), operators, and documentation snippets.
# Maintenance: supply_chain_app_secret_arn is sensitive=true; do not paste real ARNs in tickets.
# =============================================================================

output "http_api_base_url" {
  description = "Base URL for API Gateway HTTP API (no trailing slash). Use as AWS_HTTP_API_BASE_URL and VITE_AWS_HTTP_API_BASE_URL."
  value       = aws_apigatewayv2_api.http.api_endpoint
}

output "cognito_token_url" {
  description = "OAuth2 token endpoint (client credentials + authorization code)."
  value       = "https://${aws_cognito_user_pool_domain.main.domain}.auth.${var.aws_region}.amazoncognito.com/oauth2/token"
}

output "cognito_issuer" {
  description = "OpenID issuer URL (VITE_COGNITO_AUTHORITY for web-portal)."
  value       = "https://cognito-idp.${var.aws_region}.amazonaws.com/${aws_cognito_user_pool.main.id}"
}

output "cognito_hosted_ui_base" {
  description = "Cognito hosted UI base URL (authorize / logout paths)."
  value       = "https://${aws_cognito_user_pool_domain.main.domain}.auth.${var.aws_region}.amazoncognito.com"
}

output "user_pool_id" {
  value = aws_cognito_user_pool.main.id
}

output "web_client_id" {
  description = "Public web app client id (PKCE)."
  value       = aws_cognito_user_pool_client.web.id
}

output "mcp_client_id" {
  description = "Machine client id (also inside supply_chain_app secret JSON)."
  value       = aws_cognito_user_pool_client.mcp.id
}

output "supply_chain_app_secret_arn" {
  description = "Secrets Manager ARN for NitroStack MCP (optional override in supply-chain/.env)."
  value       = aws_secretsmanager_secret.nitrostack_app.arn
  sensitive   = true
}

output "supply_chain_app_secret_name" {
  description = "Secrets Manager friendly name for GetSecretValue (written to .generated/.env by provision script)."
  value       = aws_secretsmanager_secret.nitrostack_app.name
}

output "cognito_web_callback_primary" {
  description = "Primary web OAuth redirect URI (VITE_OIDC_REDIRECT_URI in generated env)."
  value       = var.cognito_callback_urls[0]
}

output "products_table_name" {
  value = aws_dynamodb_table.products.name
}

output "inventory_table_name" {
  value = aws_dynamodb_table.inventory.name
}

output "orders_table_name" {
  value = aws_dynamodb_table.orders.name
}

output "lambda_function_names" {
  value = {
    catalog   = aws_lambda_function.catalog.function_name
    inventory = aws_lambda_function.inventory.function_name
    orders    = aws_lambda_function.orders.function_name
  }
}

output "nitrostack_mcp_env_snippet" {
  description = "Minimal .env for MCP — only AWS credentials; run provision script to create .generated/.env for secret name + Vite."
  value       = <<-EOT
    AWS_REGION=${var.aws_region}
    # AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY / AWS_SESSION_TOKEN in supply-chain/.env only.
    # SUPPLY_CHAIN_APP_SECRET_NAME is written to .generated/.env by scripts/provision-terraform-stack.sh
  EOT
}

output "web_portal_env_snippet" {
  description = "Public Vite vars (same content is written to .generated/.env by the provision script)."
  value       = <<-EOT
    VITE_COGNITO_AUTHORITY=https://cognito-idp.${var.aws_region}.amazonaws.com/${aws_cognito_user_pool.main.id}
    VITE_COGNITO_WEB_CLIENT_ID=${aws_cognito_user_pool_client.web.id}
    VITE_OIDC_REDIRECT_URI=http://localhost:5174/
    VITE_AWS_HTTP_API_BASE_URL=${aws_apigatewayv2_api.http.api_endpoint}
  EOT
}

output "nitrostack_mcp_operator_policy_json" {
  description = "Attach to IAM user/role used for local NitroStack MCP (GetSecretValue on the app secret)."
  value       = data.aws_iam_policy_document.nitrostack_mcp_operator.json
}

output "resource_tags_created_date" {
  description = "CreatedDate tag applied to resources (first terraform apply anchor)."
  value       = local.stack_created_date
}

output "resource_tags_expiry_date" {
  description = "ResourceExpiryDate tag (default: CreatedDate + 30 days). Extend with -var resource_expiry_date=YYYY-MM-DD."
  value       = local.resource_expiry_date
}

output "demo_user_email" {
  description = "Cognito demo user email."
  value       = var.demo_user_email
}

output "demo_user_password" {
  description = "Cognito demo user password."
  value       = var.demo_user_password
  sensitive   = true
}
