# =============================================================================
# File: apigateway.tf
# Module: aws/supply-chain
# Purpose: HTTP API, JWT authorizer (Cognito), routes to catalog/orders Lambdas, Lambda permissions.
# Maintenance: Inventory is invoke-only (no routes here). CORS from var.cors_allow_origins.
# =============================================================================

locals {
  cognito_issuer = "https://cognito-idp.${var.aws_region}.amazonaws.com/${aws_cognito_user_pool.main.id}"

  api_execute_arn = "arn:aws:execute-api:${var.aws_region}:${data.aws_caller_identity.current.account_id}:${aws_apigatewayv2_api.http.id}/*/*"
}

resource "aws_apigatewayv2_api" "http" {
  name          = "${var.project_name}-http"
  protocol_type = "HTTP"

  cors_configuration {
    allow_headers = ["authorization", "content-type", "x-correlation-id"]
    allow_methods = ["GET", "HEAD", "OPTIONS", "POST", "PUT"]
    allow_origins = var.cors_allow_origins
    max_age       = 300
  }

  lifecycle {
    ignore_changes = [tags]
  }
}

resource "aws_apigatewayv2_authorizer" "jwt" {
  api_id           = aws_apigatewayv2_api.http.id
  authorizer_type  = "JWT"
  identity_sources = ["$request.header.Authorization"]
  name             = "${var.project_name}-cognito-jwt"

  jwt_configuration {
    audience = [
      aws_cognito_user_pool_client.web.id,
      aws_cognito_user_pool_client.mcp.id,
    ]
    issuer = local.cognito_issuer
  }
}

resource "aws_apigatewayv2_integration" "catalog" {
  api_id                 = aws_apigatewayv2_api.http.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.catalog.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_integration" "orders" {
  api_id                 = aws_apigatewayv2_api.http.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.orders.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "catalog_list" {
  api_id             = aws_apigatewayv2_api.http.id
  route_key          = "GET /v1/catalog/products"
  target             = "integrations/${aws_apigatewayv2_integration.catalog.id}"
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.jwt.id
}

resource "aws_apigatewayv2_route" "catalog_get" {
  api_id             = aws_apigatewayv2_api.http.id
  route_key          = "GET /v1/catalog/products/{productId}"
  target             = "integrations/${aws_apigatewayv2_integration.catalog.id}"
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.jwt.id
}

resource "aws_apigatewayv2_route" "orders_create" {
  api_id             = aws_apigatewayv2_api.http.id
  route_key          = "POST /v1/orders"
  target             = "integrations/${aws_apigatewayv2_integration.orders.id}"
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.jwt.id
}

resource "aws_apigatewayv2_route" "orders_list" {
  api_id             = aws_apigatewayv2_api.http.id
  route_key          = "GET /v1/orders"
  target             = "integrations/${aws_apigatewayv2_integration.orders.id}"
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.jwt.id
}

resource "aws_apigatewayv2_route" "orders_get" {
  api_id             = aws_apigatewayv2_api.http.id
  route_key          = "GET /v1/orders/{orderId}"
  target             = "integrations/${aws_apigatewayv2_integration.orders.id}"
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.jwt.id
}

resource "aws_apigatewayv2_route" "orders_cancel" {
  api_id             = aws_apigatewayv2_api.http.id
  route_key          = "POST /v1/orders/{orderId}/cancel"
  target             = "integrations/${aws_apigatewayv2_integration.orders.id}"
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.jwt.id
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.http.id
  name        = "$default"
  auto_deploy = true

  depends_on = [
    aws_apigatewayv2_route.catalog_list,
    aws_apigatewayv2_route.catalog_get,
    aws_apigatewayv2_route.orders_create,
    aws_apigatewayv2_route.orders_list,
    aws_apigatewayv2_route.orders_get,
    aws_apigatewayv2_route.orders_cancel,
  ]
}

resource "aws_lambda_permission" "catalog_apigw" {
  statement_id  = "AllowExecutionFromAPIGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.catalog.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = local.api_execute_arn
}

resource "aws_lambda_permission" "orders_apigw" {
  statement_id  = "AllowExecutionFromAPIGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.orders.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = local.api_execute_arn
}
