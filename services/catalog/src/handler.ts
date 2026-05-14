/**
 * @file handler.ts
 * @summary Catalog Lambda: HTTP GET list/get products + internal `getBySku` for orders (invoke path).
 * @context API Gateway JWT routes and direct Lambda invoke from orders service.
 * @debugging CloudWatch Logs — filter `correlationId` or `where` (`catalog.*`). 5xx responses use generic text + correlationId.
 */

import { randomUUID } from 'node:crypto';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import {
  logLambdaError,
  productSchema,
  userFacing500Message,
  type Product
} from '@supply-chain/contracts';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

function json(statusCode: number, body: unknown, correlationId: string) {
  return {
    statusCode,
    headers: {
      'content-type': 'application/json',
      'x-correlation-id': correlationId
    },
    body: JSON.stringify(body)
  };
}

function readCorrelationId(event: { headers?: Record<string, string | undefined> }) {
  const h = event.headers ?? {};
  const key = Object.keys(h).find((k) => k.toLowerCase() === 'x-correlation-id');
  const found = key ? h[key] : undefined;
  if (found && found.trim()) return found.trim();
  return randomUUID();
}

type InternalCatalogEvent = {
  internal: true;
  action: 'getBySku';
  sku: string;
  correlationId: string;
};

function isInternalCatalogEvent(event: unknown): event is InternalCatalogEvent {
  if (!event || typeof event !== 'object') return false;
  const e = event as Record<string, unknown>;
  return e.internal === true && e.action === 'getBySku' && typeof e.sku === 'string' && typeof e.correlationId === 'string';
}

export const handler = async (event: {
  rawPath?: string;
  pathParameters?: Record<string, string | undefined>;
  headers?: Record<string, string | undefined>;
} | InternalCatalogEvent) => {
  // --- Internal synchronous invoke (orders → catalog) — not behind API Gateway ---
  if (isInternalCatalogEvent(event)) {
    const { correlationId, sku } = event;
    const tableName = process.env.PRODUCTS_TABLE_NAME;
    if (!tableName) {
      logLambdaError(correlationId, 'catalog.internal.config', new Error('PRODUCTS_TABLE_NAME is not set'));
      return { ok: false as const, error: { code: 'MISCONFIGURED', message: 'PRODUCTS_TABLE_NAME missing' } };
    }
    try {
      const got = await ddb.send(
        new GetCommand({
          TableName: tableName,
          Key: { productId: sku }
        })
      );
      if (!got.Item) return { ok: false as const, error: { code: 'NOT_FOUND', message: 'Product not found', sku } };
      const parsed = productSchema.safeParse(got.Item);
      if (!parsed.success) {
        logLambdaError(correlationId, 'catalog.internal.parse', parsed.error);
        return { ok: false as const, error: { code: 'DATA_CORRUPT', message: 'Stored product failed validation' } };
      }
      return { ok: true as const, product: parsed.data };
    } catch (err) {
      logLambdaError(correlationId, 'catalog.internal', err);
      return {
        ok: false as const,
        error: { code: 'CATALOG_FAILURE', message: 'Catalog lookup failed' }
      };
    }
  }

  const correlationId = readCorrelationId(event);
  const tableName = process.env.PRODUCTS_TABLE_NAME;
  if (!tableName) {
    logLambdaError(correlationId, 'catalog.config', new Error('PRODUCTS_TABLE_NAME is not set'));
    return json(500, { ok: false, error: { code: 'MISCONFIGURED', message: 'Service configuration is incomplete' } }, correlationId);
  }

  try {
    const path = event.rawPath ?? '';
    if (path === '/v1/catalog/products' || path.endsWith('/v1/catalog/products')) {
      const out = await ddb.send(
        new ScanCommand({
          TableName: tableName,
          Limit: 100
        })
      );
      const items = (out.Items ?? []) as Record<string, unknown>[];
      const products: Product[] = [];
      for (const raw of items) {
        const parsed = productSchema.safeParse(raw);
        if (parsed.success) products.push(parsed.data);
      }
      return json(200, { ok: true, products }, correlationId);
    }

    const singleMatch = path.match(/\/v1\/catalog\/products\/([^/]+)$/);
    const productId = event.pathParameters?.productId ?? singleMatch?.[1];
    if (productId) {
      const got = await ddb.send(
        new GetCommand({
          TableName: tableName,
          Key: { productId }
        })
      );
      if (!got.Item) {
        return json(404, { ok: false, error: { code: 'NOT_FOUND', message: 'Product not found', productId } }, correlationId);
      }
      const parsed = productSchema.safeParse(got.Item);
      if (!parsed.success) {
        logLambdaError(correlationId, 'catalog.parse', parsed.error);
        return json(500, { ok: false, error: { code: 'DATA_CORRUPT', message: 'Stored product failed validation' } }, correlationId);
      }
      return json(200, { ok: true, product: parsed.data }, correlationId);
    }

    return json(404, { ok: false, error: { code: 'ROUTE_NOT_FOUND', message: 'No handler for this path' } }, correlationId);
  } catch (err) {
    logLambdaError(correlationId, 'catalog.handler', err);
    return json(
      500,
      {
        ok: false,
        error: {
          code: 'CATALOG_FAILURE',
          message: userFacing500Message(correlationId)
        }
      },
      correlationId
    );
  }
};
