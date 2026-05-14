# =============================================================================
# File: iam.tf
# Module: aws/supply-chain
# Purpose: Lambda execution roles, DynamoDB/invoke inline policies, managed policy attachments.
# Maintenance: Least-privilege per function; orders role includes lambda:InvokeFunction for peers.
# =============================================================================

data "aws_iam_policy_document" "lambda_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "catalog" {
  name               = "${var.project_name}-catalog-lambda"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
}

resource "aws_iam_role_policy_attachment" "catalog_basic" {
  role       = aws_iam_role.catalog.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy_attachment" "catalog_xray" {
  role       = aws_iam_role.catalog.name
  policy_arn = "arn:aws:iam::aws:policy/AWSXRayDaemonWriteAccess"
}

data "aws_iam_policy_document" "catalog_ddb" {
  statement {
    sid = "ProductsRead"
    actions = [
      "dynamodb:GetItem",
      "dynamodb:Scan",
    ]
    resources = [aws_dynamodb_table.products.arn]
  }
}

resource "aws_iam_role_policy" "catalog_ddb" {
  name   = "ddb-products-read"
  role   = aws_iam_role.catalog.id
  policy = data.aws_iam_policy_document.catalog_ddb.json
}

resource "aws_iam_role" "inventory" {
  name               = "${var.project_name}-inventory-lambda"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
}

resource "aws_iam_role_policy_attachment" "inventory_basic" {
  role       = aws_iam_role.inventory.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy_attachment" "inventory_xray" {
  role       = aws_iam_role.inventory.name
  policy_arn = "arn:aws:iam::aws:policy/AWSXRayDaemonWriteAccess"
}

data "aws_iam_policy_document" "inventory_ddb" {
  statement {
    sid = "InventoryCrud"
    actions = [
      "dynamodb:GetItem",
      "dynamodb:PutItem",
      "dynamodb:UpdateItem",
      "dynamodb:DeleteItem",
      "dynamodb:DescribeTable",
    ]
    resources = [aws_dynamodb_table.inventory.arn]
  }
}

resource "aws_iam_role_policy" "inventory_ddb" {
  name   = "ddb-inventory"
  role   = aws_iam_role.inventory.id
  policy = data.aws_iam_policy_document.inventory_ddb.json
}

resource "aws_iam_role" "orders" {
  name               = "${var.project_name}-orders-lambda"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
}

resource "aws_iam_role_policy_attachment" "orders_basic" {
  role       = aws_iam_role.orders.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy_attachment" "orders_xray" {
  role       = aws_iam_role.orders.name
  policy_arn = "arn:aws:iam::aws:policy/AWSXRayDaemonWriteAccess"
}

data "aws_iam_policy_document" "orders_ddb" {
  statement {
    sid = "OrdersCrud"
    actions = [
      "dynamodb:GetItem",
      "dynamodb:PutItem",
      "dynamodb:UpdateItem",
      "dynamodb:DeleteItem",
      "dynamodb:Query",
      "dynamodb:DescribeTable",
    ]
    resources = [
      aws_dynamodb_table.orders.arn,
      "${aws_dynamodb_table.orders.arn}/index/*",
    ]
  }
}

resource "aws_iam_role_policy" "orders_ddb" {
  name   = "ddb-orders"
  role   = aws_iam_role.orders.id
  policy = data.aws_iam_policy_document.orders_ddb.json
}

data "aws_iam_policy_document" "orders_invoke" {
  statement {
    sid = "InvokeCatalogInventory"
    actions = [
      "lambda:InvokeFunction",
    ]
    resources = [
      aws_lambda_function.catalog.arn,
      aws_lambda_function.inventory.arn,
    ]
  }
}

resource "aws_iam_role_policy" "orders_invoke" {
  name   = "invoke-peer-lambdas"
  role   = aws_iam_role.orders.id
  policy = data.aws_iam_policy_document.orders_invoke.json
}
