/**
 * @file handler.ts
 * @summary Inventory Lambda — reserve / release stock (invoke-only; no public HTTP in this stack).
 * @context Called synchronously from orders Lambda. Uses conditional writes to avoid overselling.
 * @debugging CloudWatch — `correlationId`, `where` (`inventory.*`). Validation errors return structured `VALIDATION` without 5xx.
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { logLambdaError, releaseRequestSchema, reserveRequestSchema } from '@supply-chain/contracts';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export type InventoryInvokePayload =
  | ({ action: 'reserve' } & { correlationId: string } & Record<string, unknown>)
  | ({ action: 'release' } & { correlationId: string } & Record<string, unknown>);

export const handler = async (event: InventoryInvokePayload) => {
  const correlationId = typeof event.correlationId === 'string' ? event.correlationId : 'unknown';
  const tableName = process.env.INVENTORY_TABLE_NAME;
  if (!tableName) {
    logLambdaError(correlationId, 'inventory.config', new Error('INVENTORY_TABLE_NAME is not set'));
    return { ok: false as const, error: { code: 'MISCONFIGURED', message: 'INVENTORY_TABLE_NAME missing' } };
  }

  try {
    if (event.action === 'reserve') {
      const parsed = reserveRequestSchema.safeParse(event);
      if (!parsed.success) {
        return { ok: false as const, error: { code: 'VALIDATION', message: parsed.error.flatten() } };
      }
      const { sku, quantity, reservationId } = parsed.data;
      try {
        await ddb.send(
          new UpdateCommand({
            TableName: tableName,
            Key: { sku },
            UpdateExpression: 'ADD quantityAvailable :neg SET updatedAt = :now',
            ConditionExpression: 'quantityAvailable >= :need',
            ExpressionAttributeValues: {
              ':neg': -quantity,
              ':need': quantity,
              ':now': new Date().toISOString()
            }
          })
        );
      } catch (err: unknown) {
        const name = err && typeof err === 'object' && 'name' in err ? String((err as { name?: string }).name) : '';
        if (name === 'ConditionalCheckFailedException') {
          return {
            ok: false as const,
            error: { code: 'INSUFFICIENT_STOCK', message: 'Not enough quantity available', sku, quantity }
          };
        }
        logLambdaError(correlationId, 'inventory.reserve.ddb', err, { sku, quantity });
        throw err;
      }
      void reservationId;
      return { ok: true as const, action: 'reserve', sku, quantity };
    }

    if (event.action === 'release') {
      const parsed = releaseRequestSchema.safeParse(event);
      if (!parsed.success) {
        return { ok: false as const, error: { code: 'VALIDATION', message: parsed.error.flatten() } };
      }
      const { sku, quantity, reservationId } = parsed.data;
      try {
        await ddb.send(
          new UpdateCommand({
            TableName: tableName,
            Key: { sku },
            UpdateExpression: 'ADD quantityAvailable :q SET updatedAt = :now',
            ExpressionAttributeValues: {
              ':q': quantity,
              ':now': new Date().toISOString()
            }
          })
        );
      } catch (err) {
        logLambdaError(correlationId, 'inventory.release.ddb', err, { sku, quantity });
        return { ok: false as const, error: { code: 'RELEASE_FAILED', message: 'Could not return stock to available quantity' } };
      }
      void reservationId;
      return { ok: true as const, action: 'release', sku, quantity };
    }

    return { ok: false as const, error: { code: 'UNKNOWN_ACTION', message: 'Unsupported inventory action' } };
  } catch (err) {
    logLambdaError(correlationId, 'inventory.handler', err);
    return {
      ok: false as const,
      error: { code: 'INVENTORY_FAILURE', message: 'Inventory operation failed' }
    };
  }
};
