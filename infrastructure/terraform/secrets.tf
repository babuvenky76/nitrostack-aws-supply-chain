# =============================================================================
# File: secrets.tf
# Module: aws/supply-chain
# Purpose: Secrets Manager unified app secret (API URLs, Cognito M2M, table names) + operator IAM policy doc.
# Maintenance: Values encrypted at rest by AWS; MCP/seed read via IAM. Not for browser (use .generated/.env VITE_*).
# =============================================================================
# Runtime configuration + credentials for NitroStack MCP (not for the browser).
# The MCP process uses IAM (e.g. from .env) to call GetSecretValue on this ARN.

locals {
  nitrostack_app_secret_payload = {
    httpApiBaseUrl     = aws_apigatewayv2_api.http.api_endpoint
    cognitoTokenUrl    = "https://${aws_cognito_user_pool_domain.main.domain}.auth.${var.aws_region}.amazoncognito.com/oauth2/token"
    cognitoIssuer      = "https://cognito-idp.${var.aws_region}.amazonaws.com/${aws_cognito_user_pool.main.id}"
    webClientId        = aws_cognito_user_pool_client.web.id
    mcpClientId        = aws_cognito_user_pool_client.mcp.id
    mcpClientSecret    = aws_cognito_user_pool_client.mcp.client_secret
    cognitoOAuthScope  = "supply-chain/order.read supply-chain/order.write"
    productsTableName  = aws_dynamodb_table.products.name
    inventoryTableName = aws_dynamodb_table.inventory.name
    ordersTableName    = aws_dynamodb_table.orders.name
  }
}

resource "aws_secretsmanager_secret" "nitrostack_app" {
  name                    = "${var.project_name}/nitrostack-app"
  description             = "NitroStack MCP + tooling: API URLs, Cognito M2M credentials, DynamoDB table names. Values encrypted at rest by AWS (Secrets Manager); written by Terraform."
  recovery_window_in_days = var.environment == "prod" ? 30 : 0
}

resource "aws_secretsmanager_secret_version" "nitrostack_app" {
  secret_id     = aws_secretsmanager_secret.nitrostack_app.id
  secret_string = jsonencode(local.nitrostack_app_secret_payload)
}

data "aws_iam_policy_document" "nitrostack_mcp_operator" {
  statement {
    sid    = "ReadSupplyChainAppSecret"
    effect = "Allow"
    actions = [
      "secretsmanager:GetSecretValue",
      "secretsmanager:DescribeSecret",
    ]
    resources = [aws_secretsmanager_secret.nitrostack_app.arn]
  }
}
