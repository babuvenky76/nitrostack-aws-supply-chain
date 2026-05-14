/**
 * @file seed-dynamodb.ts
 * @summary Seeds catalog + inventory rows in DynamoDB after Terraform deploy.
 * @context Reads `.generated/.env` then `.env`; resolves table names from Secrets Manager unless overridden.
 * @debugging Failures log to stderr and append to `supply-chain/.supply-chain-runtime.log`.
 */

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

async function resolveTableNames(): Promise<{ productsTable: string; inventoryTable: string }> {
  const fromEnv = {
    productsTable: process.env.PRODUCTS_TABLE_NAME?.trim() ?? '',
    inventoryTable: process.env.INVENTORY_TABLE_NAME?.trim() ?? ''
  };
  if (fromEnv.productsTable && fromEnv.inventoryTable) {
    return { productsTable: fromEnv.productsTable, inventoryTable: fromEnv.inventoryTable };
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

  if (!productsTable || !inventoryTable) {
    throw new Error(
      'Secret JSON must include productsTableName and inventoryTableName (Terraform-managed secret), or set PRODUCTS_TABLE_NAME and INVENTORY_TABLE_NAME in .env'
    );
  }
  return { productsTable, inventoryTable };
}

async function main() {
  const { productsTable, inventoryTable } = await resolveTableNames();
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
  console.error('Seed complete.');
}

main().catch((err) => {
  const payload = { level: 'ERROR' as const, where: 'seed-dynamodb', message: String(err), stack: err?.stack };
  console.error(JSON.stringify(payload));
  appendScriptLog(payload);
  process.exit(1);
});
