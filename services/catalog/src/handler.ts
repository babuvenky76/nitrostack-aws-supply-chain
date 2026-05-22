/**
 * @file handler.ts
 * @summary Catalog Lambda: HTTP GET list/get products + internal `getBySku` for orders (invoke path).
 * @context API Gateway JWT routes and direct Lambda invoke from orders service.
 * @debugging CloudWatch Logs — filter `correlationId` or `where` (`catalog.*`). 5xx responses use generic text + correlationId.
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import {
  logLambdaError,
  productSchema,
  userFacing500Message,
  type Product
} from '@supply-chain/contracts';
import { json, notFoundError, internalServerError, successResponse } from '../../common/http-response.js';
import { readCorrelationId } from '../../common/correlation.js';
import { validateSKU } from '../../common/path-validation.js';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

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
    const { correlationId, sku: rawSku } = event;
    let sku: string;
    try {
      sku = validateSKU(rawSku);
    } catch {
      return { ok: false as const, error: { code: 'INVALID_FORMAT', message: 'Invalid SKU format' } };
    }
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

    const singleMatch = path.match(/^\/v1\/catalog\/products\/([A-Za-z0-9_-]+)$/);
    const productIdParam = event.pathParameters?.productId ?? singleMatch?.[1];
    if (productIdParam) {
      let productId: string;
      try {
        productId = validateSKU(productIdParam);
      } catch {
        return json(400, { ok: false, error: { code: 'INVALID_FORMAT', message: 'Invalid product ID format' } }, correlationId);
      }

      const got = await ddb.send(
        new GetCommand({
          TableName: tableName,
          Key: { productId }
        })
      );
      if (!got.Item) {
        return notFoundError('Product not found', correlationId);
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
    return internalServerError(correlationId);
  }
};
