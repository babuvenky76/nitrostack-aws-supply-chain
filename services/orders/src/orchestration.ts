/**
 * @file orchestration.ts
 * @summary Lambda-invoke orchestration helpers for orders service (catalog & inventory invokes).
 */

import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { logLambdaError, safeInvokeJsonParse } from '@supply-chain/contracts';
import type { CatalogInternalResponse, InventoryInvokeResponse } from './types.js';

const lambda = new LambdaClient({});

export async function invokeCatalogBySku(correlationId: string, sku: string, catalogFunctionName: string): Promise<CatalogInternalResponse> {
  const cmd = new InvokeCommand({
    FunctionName: catalogFunctionName,
    InvocationType: 'RequestResponse',
    Payload: Buffer.from(JSON.stringify({ internal: true, action: 'getBySku', sku, correlationId }), 'utf8')
  });
  try {
    const res = await lambda.send(cmd);
    const raw = res.Payload ? Buffer.from(res.Payload).toString('utf8') : '';
    if (res.FunctionError) {
      logLambdaError(correlationId, 'invoke.catalog.FunctionError', new Error(String(raw)), { sku });
      return { ok: false, error: { code: 'LAMBDA_ERROR', message: 'Catalog service reported an error' } };
    }
    if (!raw) return { ok: false, error: { code: 'EMPTY_PAYLOAD', message: 'Catalog returned no data' } };
    const parsed = safeInvokeJsonParse<CatalogInternalResponse>(raw, correlationId, 'invoke.catalog.json');
    if (!parsed.ok) return { ok: false, error: { code: 'INVALID_PAYLOAD', message: 'Catalog returned invalid JSON' } };
    return parsed.value;
  } catch (err) {
    logLambdaError(correlationId, 'invoke.catalog', err, { sku });
    return { ok: false, error: { code: 'INVOKE_FAILED', message: 'Could not reach catalog service' } };
  }
}

export async function invokeInventory(
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
    if (!raw) return { ok: false, error: { code: 'EMPTY_PAYLOAD', message: 'Inventory returned no data' } };
    const parsed = safeInvokeJsonParse<InventoryInvokeResponse>(raw, correlationId, 'invoke.inventory.json');
    if (!parsed.ok) return { ok: false, error: { code: 'INVALID_PAYLOAD', message: 'Inventory returned invalid JSON' } };
    return parsed.value;
  } catch (err) {
    logLambdaError(correlationId, 'invoke.inventory', err, { payload });
    return { ok: false, error: { code: 'INVOKE_FAILED', message: 'Could not reach inventory service' } };
  }
}

export async function releaseAll(
  correlationId: string,
  inventoryFunctionName: string,
  done: Array<{ sku: string; quantity: number; reservationId: string }>
) {
  const results: Array<{ sku: string; success: boolean; error?: { code: string; message: string } }> = [];

  for (const d of done) {
    const rel = await invokeInventory(correlationId, inventoryFunctionName, {
      action: 'release',
      reservationId: d.reservationId,
      sku: d.sku,
      quantity: d.quantity
    });
    if (!rel.ok) {
      results.push({ sku: d.sku, success: false, error: rel.error });
      logLambdaError(correlationId, 'orders.releaseAll.FAILED', new Error(`Inventory release failed for SKU ${d.sku}`), {
        sku: d.sku,
        quantity: d.quantity,
        reservationId: d.reservationId,
        error: rel.error
      });
    } else {
      results.push({ sku: d.sku, success: true });
    }
  }

  const failures = results.filter((r) => !r.success);
  if (failures.length > 0) {
    console.error(
      JSON.stringify({
        level: 'ERROR',
        correlationId,
        where: 'orders.releaseAll.summary',
        message: `Partial inventory release failure: ${failures.length}/${results.length} SKUs`,
        failures
      })
    );
  }

  return results;
}
