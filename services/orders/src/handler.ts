/**
 * @file handler.ts
 * @summary Orders Lambda — HTTP CRUD + cancel; orchestrates catalog (invoke) and inventory reserve/release.
 * @context API Gateway JWT routes; peer Lambdas invoked synchronously. Inventory has no public HTTP route.
 * @debugging CloudWatch: filter `correlationId` / `where` (`orders.*`, `invoke.*`). Client 5xx bodies use generic text + correlationId.
 */

import { randomUUID } from 'node:crypto';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import {
  createOrderSchema,
  logLambdaError,
  orderRecordSchema,
  safeInvokeJsonParse,
  safeJsonParse,
  type OrderRecord,
  type Product,
  userFacing500Message
} from '@supply-chain/contracts';

const lambda = new LambdaClient({});
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

type CatalogInternalResponse =
  | { ok: true; product: Product }
  | { ok: false; error: { code: string; message: string; sku?: string } };

type InventoryInvokeResponse =
  | { ok: true; action: string; sku: string; quantity: number }
  | { ok: false; error: { code: string; message: string; sku?: string; quantity?: number } };

async function invokeCatalogBySku(correlationId: string, sku: string, catalogFunctionName: string): Promise<CatalogInternalResponse> {
  const cmd = new InvokeCommand({
    FunctionName: catalogFunctionName,
    InvocationType: 'RequestResponse',
    Payload: Buffer.from(
      JSON.stringify({
        internal: true,
        action: 'getBySku',
        sku,
        correlationId
      }),
      'utf8'
    )
  });
  try {
    const res = await lambda.send(cmd);
    const raw = res.Payload ? Buffer.from(res.Payload).toString('utf8') : '';
    if (res.FunctionError) {
      logLambdaError(correlationId, 'invoke.catalog.FunctionError', new Error(String(raw)), { sku });
      return { ok: false, error: { code: 'LAMBDA_ERROR', message: 'Catalog service reported an error' } };
    }
    if (!raw) {
      return { ok: false, error: { code: 'EMPTY_PAYLOAD', message: 'Catalog returned no data' } };
    }
    const parsed = safeInvokeJsonParse<CatalogInternalResponse>(raw, correlationId, 'invoke.catalog.json');
    if (!parsed.ok) {
      return { ok: false, error: { code: 'INVALID_PAYLOAD', message: 'Catalog returned invalid JSON' } };
    }
    return parsed.value;
  } catch (err) {
    logLambdaError(correlationId, 'invoke.catalog', err, { sku });
    return { ok: false, error: { code: 'INVOKE_FAILED', message: 'Could not reach catalog service' } };
  }
}

async function invokeInventory(
  correlationId: string,
  inventoryFunctionName: string,
  payload: { action: 'reserve' | 'release'; reservationId: string; sku: string; quantity: number }
): Promise<InventoryInvokeResponse> {
  const cmd = new InvokeCommand({
    FunctionName: inventoryFunctionName,
    InvocationType: 'RequestResponse',
    Payload: Buffer.from(JSON.stringify({ correlationId, ...payload }), 'utf8')
  });
  try {
    const res = await lambda.send(cmd);
    const raw = res.Payload ? Buffer.from(res.Payload).toString('utf8') : '';
    if (res.FunctionError) {
      logLambdaError(correlationId, 'invoke.inventory.FunctionError', new Error(String(raw)), { payload });
      return { ok: false, error: { code: 'LAMBDA_ERROR', message: 'Inventory service reported an error' } };
    }
    if (!raw) {
      return { ok: false, error: { code: 'EMPTY_PAYLOAD', message: 'Inventory returned no data' } };
    }
    const parsed = safeInvokeJsonParse<InventoryInvokeResponse>(raw, correlationId, 'invoke.inventory.json');
    if (!parsed.ok) {
      return { ok: false, error: { code: 'INVALID_PAYLOAD', message: 'Inventory returned invalid JSON' } };
    }
    return parsed.value;
  } catch (err) {
    logLambdaError(correlationId, 'invoke.inventory', err, { payload });
    return { ok: false, error: { code: 'INVOKE_FAILED', message: 'Could not reach inventory service' } };
  }
}

async function releaseAll(
  correlationId: string,
  inventoryFunctionName: string,
  done: Array<{ sku: string; quantity: number; reservationId: string }>
) {
  for (const d of done) {
    const rel = await invokeInventory(correlationId, inventoryFunctionName, {
      action: 'release',
      reservationId: d.reservationId,
      sku: d.sku,
      quantity: d.quantity
    });
    if (!rel.ok) {
      console.error(JSON.stringify({ level: 'ERROR', correlationId, where: 'orders.releaseAll', release: d, error: rel.error }));
    }
  }
}

export const handler = async (event: {
  rawPath?: string;
  pathParameters?: Record<string, string | undefined>;
  headers?: Record<string, string | undefined>;
  body?: string;
  isBase64Encoded?: boolean;
  requestContext?: { http?: { method?: string } };
}) => {
  const correlationId = readCorrelationId(event);
  const ordersTable = process.env.ORDERS_TABLE_NAME;
  const catalogFn = process.env.CATALOG_FUNCTION_NAME;
  const inventoryFn = process.env.INVENTORY_FUNCTION_NAME;
  if (!ordersTable || !catalogFn || !inventoryFn) {
    logLambdaError(correlationId, 'orders.config', new Error('Missing ORDERS_TABLE_NAME / CATALOG_FUNCTION_NAME / INVENTORY_FUNCTION_NAME'));
    return json(
      500,
      { ok: false, error: { code: 'MISCONFIGURED', message: 'Orders service configuration is incomplete' } },
      correlationId
    );
  }

  const method = event.requestContext?.http?.method ?? 'GET';
  const path = event.rawPath ?? '';

  try {
    if (method === 'POST' && /\/v1\/orders\/[^/]+\/cancel$/.test(path)) {
      const cancelMatch = path.match(/\/v1\/orders\/([^/]+)\/cancel$/);
      const cancelOrderId = event.pathParameters?.orderId ?? cancelMatch?.[1];
      if (!cancelOrderId) {
        return json(400, { ok: false, error: { code: 'ORDER_ID_REQUIRED', message: 'Missing order id' } }, correlationId);
      }
      const got = await ddb.send(new GetCommand({ TableName: ordersTable, Key: { orderId: cancelOrderId } }));
      if (!got.Item) return json(404, { ok: false, error: { code: 'NOT_FOUND', message: 'Order not found' } }, correlationId);
      const parsed = orderRecordSchema.safeParse(got.Item);
      if (!parsed.success) {
        logLambdaError(correlationId, 'orders.parse', parsed.error);
        return json(500, { ok: false, error: { code: 'DATA_CORRUPT', message: 'Stored order failed validation' } }, correlationId);
      }
      const order = parsed.data;
      if (order.status !== 'CONFIRMED') {
        return json(409, { ok: false, error: { code: 'INVALID_STATE', message: 'Only CONFIRMED orders can be cancelled' } }, correlationId);
      }
      for (const line of order.lines) {
        const rel = await invokeInventory(correlationId, inventoryFn, {
          action: 'release',
          reservationId: cancelOrderId,
          sku: line.sku,
          quantity: line.quantity
        });
        if (!rel.ok) {
          logLambdaError(correlationId, 'orders.cancel.release', new Error('Inventory release failed'), {
            details: rel.error
          });
          return json(
            500,
            { ok: false, error: { code: 'CANCEL_RELEASE_FAILED', message: userFacing500Message(correlationId) } },
            correlationId
          );
        }
      }
      await ddb.send(
        new UpdateCommand({
          TableName: ordersTable,
          Key: { orderId: cancelOrderId },
          UpdateExpression: 'SET #s = :c, updatedAt = :u',
          ConditionExpression: '#s = :prev',
          ExpressionAttributeNames: { '#s': 'status' },
          ExpressionAttributeValues: {
            ':c': 'CANCELLED',
            ':u': new Date().toISOString(),
            ':prev': 'CONFIRMED'
          }
        })
      );
      return json(200, { ok: true, orderId: cancelOrderId, status: 'CANCELLED' }, correlationId);
    }

    if (method === 'GET' && /\/v1\/orders$/.test(path)) {
      const q = await ddb.send(
        new QueryCommand({
          TableName: ordersTable,
          IndexName: 'GSI1',
          KeyConditionExpression: 'gsi1pk = :pk',
          ExpressionAttributeValues: { ':pk': 'ORDER' },
          Limit: 50,
          ScanIndexForward: false
        })
      );
      const items = (q.Items ?? []) as Record<string, unknown>[];
      const orders: OrderRecord[] = [];
      for (const raw of items) {
        const p = orderRecordSchema.safeParse(raw);
        if (p.success) orders.push(p.data);
      }
      return json(200, { ok: true, orders }, correlationId);
    }

    const getMatch = path.match(/\/v1\/orders\/([^/]+)$/);
    const orderId = event.pathParameters?.orderId ?? getMatch?.[1];
    if (method === 'GET' && orderId) {
      const got = await ddb.send(new GetCommand({ TableName: ordersTable, Key: { orderId } }));
      if (!got.Item) return json(404, { ok: false, error: { code: 'NOT_FOUND', message: 'Order not found' } }, correlationId);
      const p = orderRecordSchema.safeParse(got.Item);
      if (!p.success) {
        logLambdaError(correlationId, 'orders.parse', p.error);
        return json(500, { ok: false, error: { code: 'DATA_CORRUPT', message: 'Stored order failed validation' } }, correlationId);
      }
      return json(200, { ok: true, order: p.data }, correlationId);
    }

    if (method === 'POST' && /\/v1\/orders$/.test(path)) {
      let rawBody: unknown = {};
      if (event.body) {
        const raw = event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body;
        if (raw.trim()) {
          const pj = safeJsonParse(raw, correlationId);
          if (!pj.ok) {
            return json(400, { ok: false, error: { code: 'INVALID_JSON', message: 'Request body must be valid JSON' } }, correlationId);
          }
          rawBody = pj.value;
        }
      }
      const parsedBody = createOrderSchema.safeParse(rawBody);
      if (!parsedBody.success) {
        return json(400, { ok: false, error: { code: 'VALIDATION', details: parsedBody.error.flatten() } }, correlationId);
      }
      const input = parsedBody.data;
      const newOrderId = randomUUID();
      const reservations: Array<{ sku: string; quantity: number; reservationId: string }> = [];

      const pricedLines: OrderRecord['lines'] = [];
      for (const line of input.lines) {
        const cat = await invokeCatalogBySku(correlationId, line.sku, catalogFn);
        if (!cat.ok) {
          await releaseAll(correlationId, inventoryFn, reservations);
          return json(400, { ok: false, error: { code: 'UNKNOWN_SKU', message: 'Product not found for sku', sku: line.sku } }, correlationId);
        }
        const resv = await invokeInventory(correlationId, inventoryFn, {
          action: 'reserve',
          reservationId: newOrderId,
          sku: line.sku,
          quantity: line.quantity
        });
        if (!resv.ok) {
          await releaseAll(correlationId, inventoryFn, reservations);
          return json(409, { ok: false, error: { code: 'INVENTORY', details: resv.error } }, correlationId);
        }
        reservations.push({ sku: line.sku, quantity: line.quantity, reservationId: newOrderId });
        pricedLines.push({
          sku: line.sku,
          quantity: line.quantity,
          unitPriceCents: cat.product.unitPriceCents
        });
      }

      const now = new Date().toISOString();
      const record: OrderRecord = {
        orderId: newOrderId,
        customerRef: input.customerRef,
        status: 'CONFIRMED',
        lines: pricedLines,
        createdAt: now,
        updatedAt: now
      };

      try {
        await ddb.send(
          new PutCommand({
            TableName: ordersTable,
            Item: {
              ...record,
              gsi1pk: 'ORDER',
              gsi1sk: now
            },
            ConditionExpression: 'attribute_not_exists(orderId)'
          })
        );
      } catch (err) {
        logLambdaError(correlationId, 'orders.put', err);
        await releaseAll(correlationId, inventoryFn, reservations);
        return json(
          500,
          { ok: false, error: { code: 'ORDER_PERSIST_FAILED', message: userFacing500Message(correlationId) } },
          correlationId
        );
      }

      return json(201, { ok: true, order: record }, correlationId);
    }

    return json(404, { ok: false, error: { code: 'ROUTE_NOT_FOUND', message: 'No handler for this path' } }, correlationId);
  } catch (err) {
    logLambdaError(correlationId, 'orders.handler', err);
    return json(
      500,
      { ok: false, error: { code: 'ORDERS_FAILURE', message: userFacing500Message(correlationId) } },
      correlationId
    );
  }
};
