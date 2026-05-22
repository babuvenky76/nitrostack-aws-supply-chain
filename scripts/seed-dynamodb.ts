/**
 * @file seed-dynamodb.ts
 * @summary Seeds catalog + inventory rows in DynamoDB after Terraform deploy.
 * @context Reads `.generated/.env` then `.env`; resolves table names from Secrets Manager unless overridden.
 * @debugging Failures log to stderr and append to `supply-chain/.supply-chain-runtime.log`.
 */

import { randomUUID } from 'node:crypto';
import { config } from 'dotenv';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { appendScriptLog } from './lib/file-log.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const supplyChainRoot = join(__dirname, '..');
const generatedEnvPath = join(supplyChainRoot, '.generated', '.env');
if (existsSync(generatedEnvPath)) {
  config({ path: generatedEnvPath });
}
config({ path: join(supplyChainRoot, '.env'), override: true });

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const products = [
  { productId: 'SKU-001', sku: 'SKU-001', name: 'Titanium fastener kit', unitPriceCents: 4999 },
  { productId: 'SKU-002', sku: 'SKU-002', name: 'EV motor mount (LH)', unitPriceCents: 12900 },
  { productId: 'SKU-003', sku: 'SKU-003', name: 'HV harness shielding', unitPriceCents: 8200 }
];

const inventory = [
  { sku: 'SKU-001', quantityAvailable: 500, quantityReserved: 0 },
  { sku: 'SKU-002', quantityAvailable: 40, quantityReserved: 0 },
  { sku: 'SKU-003', quantityAvailable: 120, quantityReserved: 0 }
];

const sampleOrders = [
  {
    orderId: randomUUID(),
    customerRef: 'demo-customer',
    status: 'CONFIRMED',
    lines: [
      { sku: 'SKU-001', quantity: 10, unitPriceCents: 4999 },
      { sku: 'SKU-003', quantity: 5, unitPriceCents: 8200 }
    ],
    createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
    updatedAt: new Date(Date.now() - 86400000 * 2).toISOString()
  },
  {
    orderId: randomUUID(),
    customerRef: 'demo-customer',
    status: 'CONFIRMED',
    lines: [
      { sku: 'SKU-002', quantity: 2, unitPriceCents: 12900 }
    ],
    createdAt: new Date(Date.now() - 86400000).toISOString(),
    updatedAt: new Date(Date.now() - 86400000).toISOString()
  },
  {
    orderId: randomUUID(),
    customerRef: 'acme-corp',
    status: 'CONFIRMED',
    lines: [
      { sku: 'SKU-001', quantity: 50, unitPriceCents: 4999 },
      { sku: 'SKU-002', quantity: 10, unitPriceCents: 12900 },
      { sku: 'SKU-003', quantity: 25, unitPriceCents: 8200 }
    ],
    createdAt: new Date(Date.now() - 3600000).toISOString(),
    updatedAt: new Date(Date.now() - 3600000).toISOString()
  }
];

function resolveAppSecretId(): string {
  const arn = process.env.SUPPLY_CHAIN_APP_SECRET_ARN?.trim();
  if (arn) return arn;
  const name = process.env.SUPPLY_CHAIN_APP_SECRET_NAME?.trim();
  if (name) return name;
  const legacy = process.env.COGNITO_MCP_CREDENTIALS_SECRET_ARN?.trim();
  if (legacy) return legacy;
  const project = process.env.SUPPLY_CHAIN_PROJECT_NAME?.trim() || 'nsupply';
  return `${project}/nitrostack-app`;
}

async function resolveTableNames(): Promise<{ productsTable: string; inventoryTable: string; ordersTable: string }> {
  const fromEnv = {
    productsTable: process.env.PRODUCTS_TABLE_NAME?.trim() ?? '',
    inventoryTable: process.env.INVENTORY_TABLE_NAME?.trim() ?? '',
    ordersTable: process.env.ORDERS_TABLE_NAME?.trim() ?? ''
  };
  if (fromEnv.productsTable && fromEnv.inventoryTable) {
    return {
      productsTable: fromEnv.productsTable,
      inventoryTable: fromEnv.inventoryTable,
      ordersTable: fromEnv.ordersTable || `${process.env.SUPPLY_CHAIN_PROJECT_NAME?.trim() || 'nsupply'}-orders`
    };
  }

  const sm = new SecretsManagerClient({});
  const out = await sm.send(new GetSecretValueCommand({ SecretId: resolveAppSecretId() }));
  const raw = out.SecretString;
  if (!raw) {
    throw new Error('Secrets Manager returned an empty SecretString');
  }
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch (e) {
    throw new Error(`Secret is not valid JSON: ${e instanceof Error ? e.message : String(e)}`);
  }

  const productsTable =
    typeof parsed.productsTableName === 'string' ? parsed.productsTableName.trim() : '';
  const inventoryTable =
    typeof parsed.inventoryTableName === 'string' ? parsed.inventoryTableName.trim() : '';
  const ordersTable =
    typeof parsed.ordersTableName === 'string' ? parsed.ordersTableName.trim() : '';

  if (!productsTable || !inventoryTable) {
    throw new Error(
      'Secret JSON must include productsTableName and inventoryTableName (Terraform-managed secret), or set PRODUCTS_TABLE_NAME and INVENTORY_TABLE_NAME in .env'
    );
  }
  const project = process.env.SUPPLY_CHAIN_PROJECT_NAME?.trim() || 'nsupply';
  return { productsTable, inventoryTable, ordersTable: ordersTable || `${project}-orders` };
}

async function main() {
  const { productsTable, inventoryTable, ordersTable } = await resolveTableNames();
  for (const p of products) {
    await ddb.send(
      new PutCommand({
        TableName: productsTable,
        Item: p
      })
    );
    console.error(`Seeded product ${p.productId}`);
  }
  for (const row of inventory) {
    await ddb.send(
      new PutCommand({
        TableName: inventoryTable,
        Item: { ...row, updatedAt: new Date().toISOString() }
      })
    );
    console.error(`Seeded inventory ${row.sku} qty=${row.quantityAvailable}`);
  }
  for (const order of sampleOrders) {
    await ddb.send(
      new PutCommand({
        TableName: ordersTable,
        Item: {
          ...order,
          gsi1pk: 'ORDER',
          gsi1sk: order.createdAt
        }
      })
    );
    console.error(`Seeded order ${order.orderId} (${order.customerRef}, ${order.status}, ${order.lines.length} lines)`);
  }
  console.error('Seed complete (products + inventory + orders).');
}

main().catch((err) => {
  const errorMessage = err instanceof Error ? err.message : String(err);
  const errorStack = err instanceof Error ? err.stack : '';

  // Provide helpful recovery steps based on error context
  let recoverySteps: string[] = [];
  if (errorMessage.includes('credentials') || errorMessage.includes('AccessDenied')) {
    recoverySteps = [
      '1. Verify AWS credentials are configured:',
      '   aws sts get-caller-identity',
      '',
      '2. Ensure you have permission to access DynamoDB:',
      '   Check IAM role/policy includes: dynamodb:PutItem, dynamodb:Query',
      ''
    ];
  } else if (errorMessage.includes('ResourceNotFoundException') || errorMessage.includes('table')) {
    recoverySteps = [
      '1. Verify DynamoDB tables exist in the correct region:',
      `   aws dynamodb list-tables --region ${process.env.AWS_REGION || 'us-east-2'}`,
      '',
      '2. Ensure tables were created by Terraform:',
      '   cd infrastructure/terraform && terraform apply',
      ''
    ];
  } else if (errorMessage.includes('SUPPLY_CHAIN') || errorMessage.includes('Secrets')) {
    recoverySteps = [
      '1. Verify Secrets Manager secret was created:',
      `   aws secretsmanager get-secret-value --secret-id ${process.env.SUPPLY_CHAIN_APP_SECRET_NAME || 'nsupply/nitrostack-app'}`,
      '',
      '2. Run provisioning script to create secrets:',
      '   npm run provision:aws',
      ''
    ];
  }

  const payload = {
    level: 'ERROR' as const,
    where: 'seed-dynamodb',
    timestamp: new Date().toISOString(),
    message: errorMessage,
    stack: errorStack,
    environment: {
      AWS_REGION: process.env.AWS_REGION || 'not-set',
      PRODUCTS_TABLE_NAME: process.env.PRODUCTS_TABLE_NAME || 'not-set',
      INVENTORY_TABLE_NAME: process.env.INVENTORY_TABLE_NAME || 'not-set',
      ORDERS_TABLE_NAME: process.env.ORDERS_TABLE_NAME || 'not-set',
      SUPPLY_CHAIN_APP_SECRET_NAME: process.env.SUPPLY_CHAIN_APP_SECRET_NAME || 'not-set'
    },
    recovery_steps: [
      '0. Check that you have run: npm run provision:aws',
      '   (This creates infrastructure and generates .generated/.env)',
      '',
      ...recoverySteps,
      '3. Check CloudWatch Logs for Lambda errors:',
      `   aws logs describe-log-groups --region ${process.env.AWS_REGION || 'us-east-2'}`,
      '',
      '4. If all else fails, contact your administrator with this error message'
    ]
  };

  console.error(JSON.stringify(payload, null, 2));
  appendScriptLog(payload);
  process.exit(1);
});
