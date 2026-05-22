/**
 * @file handler.ts
 * @summary Orders Lambda — HTTP routes; delegates invoke orchestration and DynamoDB persistence.
 * @context API Gateway JWT routes; inventory is invoke-only (no public HTTP).
 */

import { randomUUID } from 'node:crypto';
import {
  createOrderSchema,
  logLambdaError,
  safeJsonParse,
  type OrderRecord,
  userFacing500Message
} from '@supply-chain/contracts';
import { json, notFoundError, internalServerError, conflictError, badRequestError } from '../../common/http-response.js';
import { readCorrelationId } from '../../common/correlation.js';
import { validateUUID, validateCustomerRef } from '../../common/path-validation.js';
import { validateRequestSize, validateOrderLines, validateQuantity } from '../../common/request-limits.js';
import { invokeCatalogBySku, invokeInventory, releaseAll } from './orchestration.js';
import { cancelOrderUpdate, getOrderById, listOrders, putOrder } from './persistence.js';

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

  const sizeCheck = validateRequestSize(event, correlationId);
  if (!sizeCheck.ok) {
    return json(413, { ok: false, error: sizeCheck.error }, correlationId);
  }

  try {
    if (method === 'POST' && /\/v1\/orders\/[0-9a-f-]+\/cancel$/i.test(path)) {
      const cancelMatch = path.match(/^\/v1\/orders\/([0-9a-f-]+)\/cancel$/i);
      const cancelOrderId = event.pathParameters?.orderId ?? cancelMatch?.[1];
      if (!cancelOrderId) return badRequestError('Missing order ID', correlationId);
      try {
        validateUUID(cancelOrderId);
      } catch {
        return badRequestError('Invalid order ID format', correlationId);
      }

      const got = await getOrderById(correlationId, ordersTable, cancelOrderId);
      if (!got.ok) {
        if (got.error === 'Order not found') return json(404, { ok: false, error: { code: 'NOT_FOUND', message: got.error } }, correlationId);
        return json(500, { ok: false, error: { code: 'DATA_CORRUPT', message: got.error } }, correlationId);
      }
      const order = got.order;
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
          logLambdaError(correlationId, 'orders.cancel.release', new Error('Inventory release failed'), { details: rel.error });
          return json(
            500,
            { ok: false, error: { code: 'CANCEL_RELEASE_FAILED', message: userFacing500Message(correlationId) } },
            correlationId
          );
        }
      }

      const updated = await cancelOrderUpdate(correlationId, ordersTable, cancelOrderId);
      if (!updated.ok) return internalServerError(correlationId);
      return json(200, { ok: true, orderId: cancelOrderId, status: 'CANCELLED' }, correlationId);
    }

    if (method === 'GET' && /\/v1\/orders$/.test(path)) {
      const listed = await listOrders(correlationId, ordersTable);
      if (!Array.isArray(listed)) return internalServerError(correlationId);
      return json(200, { ok: true, orders: listed }, correlationId);
    }

    const getMatch = path.match(/^\/v1\/orders\/([0-9a-f-]+)$/i);
    const orderIdParam = event.pathParameters?.orderId ?? getMatch?.[1];
    if (method === 'GET' && orderIdParam) {
      try {
        validateUUID(orderIdParam);
      } catch {
        return badRequestError('Invalid order ID format', correlationId);
      }
      const got = await getOrderById(correlationId, ordersTable, orderIdParam);
      if (!got.ok) {
        if (got.error === 'Order not found') return json(404, { ok: false, error: { code: 'NOT_FOUND', message: got.error } }, correlationId);
        return json(500, { ok: false, error: { code: 'DATA_CORRUPT', message: got.error } }, correlationId);
      }
      return json(200, { ok: true, order: got.order }, correlationId);
    }

    if (method === 'POST' && /\/v1\/orders$/.test(path)) {
      let rawBody: unknown = {};
      if (event.body) {
        const raw = event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body;
        if (raw.trim()) {
          const pj = safeJsonParse(raw, correlationId);
          if (!pj.ok) return badRequestError('Request body must be valid JSON', correlationId);
          rawBody = pj.value;
        }
      }

      const parsedBody = createOrderSchema.safeParse(rawBody);
      if (!parsedBody.success) {
        return badRequestError('Validation failed for order input', correlationId, parsedBody.error.flatten());
      }
      const input = parsedBody.data;

      try {
        validateCustomerRef(input.customerRef);
        validateOrderLines(input.lines);
        for (const line of input.lines) validateQuantity(line.quantity);
      } catch (err) {
        return badRequestError(err instanceof Error ? err.message : 'Validation failed', correlationId);
      }

      const newOrderId = randomUUID();
      const reservations: Array<{ sku: string; quantity: number; reservationId: string }> = [];
      const pricedLines: OrderRecord['lines'] = [];

      for (const line of input.lines) {
        const cat = await invokeCatalogBySku(correlationId, line.sku, catalogFn);
        if (!cat.ok) {
          await releaseAll(correlationId, inventoryFn, reservations);
          return badRequestError('Product not found for sku', correlationId, { sku: line.sku });
        }

        const resv = await invokeInventory(correlationId, inventoryFn, {
          action: 'reserve',
          reservationId: newOrderId,
          sku: line.sku,
          quantity: line.quantity
        });
        if (!resv.ok) {
          await releaseAll(correlationId, inventoryFn, reservations);
          return conflictError('Inventory reservation failed', correlationId, resv.error);
        }

        reservations.push({ sku: line.sku, quantity: line.quantity, reservationId: newOrderId });
        pricedLines.push({ sku: line.sku, quantity: line.quantity, unitPriceCents: cat.product.unitPriceCents });
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

      const persisted = await putOrder(correlationId, ordersTable, record);
      if (!persisted.ok) {
        await releaseAll(correlationId, inventoryFn, reservations);
        return internalServerError(correlationId);
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
