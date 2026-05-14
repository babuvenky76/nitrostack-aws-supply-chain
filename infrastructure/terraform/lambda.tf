# =============================================================================
# File: lambda.tf
# Module: aws/supply-chain
# Purpose: Zips from services/*/dist and three Lambda functions (catalog, inventory, orders).
# Maintenance: Run `npm run build` at repo root before apply; hashes drive code updates.
# =============================================================================

data "archive_file" "catalog" {
  type        = "zip"
  source_file = "${path.module}/../../services/catalog/dist/index.js"
  output_path = "${path.module}/.build/catalog.zip"
}

data "archive_file" "inventory" {
  type        = "zip"
  source_file = "${path.module}/../../services/inventory/dist/index.js"
  output_path = "${path.module}/.build/inventory.zip"
}

data "archive_file" "orders" {
  type        = "zip"
  source_file = "${path.module}/../../services/orders/dist/index.js"
  output_path = "${path.module}/.build/orders.zip"
}

resource "aws_lambda_function" "catalog" {
  function_name = "${var.project_name}-catalog"
  role          = aws_iam_role.catalog.arn
  handler       = "index.handler"
  runtime       = "nodejs20.x"
  architectures = ["x86_64"]
  timeout       = 29
  memory_size   = 256

  filename         = data.archive_file.catalog.output_path
  source_code_hash = data.archive_file.catalog.output_base64sha256

  environment {
    variables = {
      PRODUCTS_TABLE_NAME = aws_dynamodb_table.products.name
    }
  }

  tracing_config {
    mode = "Active"
  }
}

resource "aws_lambda_function" "inventory" {
  function_name = "${var.project_name}-inventory"
  role          = aws_iam_role.inventory.arn
  handler       = "index.handler"
  runtime       = "nodejs20.x"
  architectures = ["x86_64"]
  timeout       = 29
  memory_size   = 256

  filename         = data.archive_file.inventory.output_path
  source_code_hash = data.archive_file.inventory.output_base64sha256

  environment {
    variables = {
      INVENTORY_TABLE_NAME = aws_dynamodb_table.inventory.name
    }
  }

  tracing_config {
    mode = "Active"
  }
}

resource "aws_lambda_function" "orders" {
  function_name = "${var.project_name}-orders"
  role          = aws_iam_role.orders.arn
  handler       = "index.handler"
  runtime       = "nodejs20.x"
  architectures = ["x86_64"]
  timeout       = 29
  memory_size   = 256

  filename         = data.archive_file.orders.output_path
  source_code_hash = data.archive_file.orders.output_base64sha256

  environment {
    variables = {
      ORDERS_TABLE_NAME       = aws_dynamodb_table.orders.name
      CATALOG_FUNCTION_NAME   = aws_lambda_function.catalog.function_name
      INVENTORY_FUNCTION_NAME = aws_lambda_function.inventory.function_name
    }
  }

  tracing_config {
    mode = "Active"
  }

  depends_on = [
    aws_iam_role_policy.orders_invoke,
  ]
}
