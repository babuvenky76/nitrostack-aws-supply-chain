/**
 * @file persistence.ts
 * @summary DynamoDB persistence helpers for orders service.
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { logLambdaError, orderRecordSchema } from '@supply-chain/contracts';
import type { OrderRecord } from '@supply-chain/contracts';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export async function getOrderById(correlationId: string, tableName: string, orderId: string): Promise<{ ok: true; order: OrderRecord } | { ok: false; error: string }> {
  try {
    const got = await ddb.send(new GetCommand({ TableName: tableName, Key: { orderId } }));
    if (!got.Item) return { ok: false, error: 'Order not found' };
    const p = orderRecordSchema.safeParse(got.Item);
    if (!p.success) {
      logLambdaError(correlationId, 'orders.parse', p.error);
      return { ok: false, error: 'Stored order failed validation' };
    }
    return { ok: true, order: p.data };
  } catch (err) {
    logLambdaError(correlationId, 'orders.getOrder', err);
    return { ok: false, error: 'Database error' };
  }
}

export async function putOrder(correlationId: string, tableName: string, record: OrderRecord): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await ddb.send(new PutCommand({ TableName: tableName, Item: { ...record, gsi1pk: 'ORDER', gsi1sk: record.createdAt }, ConditionExpression: 'attribute_not_exists(orderId)' }));
    return { ok: true };
  } catch (err) {
    logLambdaError(correlationId, 'orders.put', err);
    return { ok: false, error: 'ORDER_PERSIST_FAILED' };
  }
}

export async function listOrders(correlationId: string, tableName: string): Promise<OrderRecord[] | { ok: false; error: string }> {
  try {
    const q = await ddb.send(
      new QueryCommand({ TableName: tableName, IndexName: 'GSI1', KeyConditionExpression: 'gsi1pk = :pk', ExpressionAttributeValues: { ':pk': 'ORDER' }, Limit: 50, ScanIndexForward: false })
    );
    const items = (q.Items ?? []) as Record<string, unknown>[];
    const orders: OrderRecord[] = [];
    for (const raw of items) {
      const p = orderRecordSchema.safeParse(raw);
      if (p.success) orders.push(p.data);
    }
    return orders;
  } catch (err) {
    logLambdaError(correlationId, 'orders.list', err);
    return { ok: false, error: 'DB_QUERY_FAILED' };
  }
}

export async function cancelOrderUpdate(correlationId: string, tableName: string, cancelOrderId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await ddb.send(
      new UpdateCommand({
        TableName: tableName,
        Key: { orderId: cancelOrderId },
        UpdateExpression: 'SET #s = :c, updatedAt = :u',
        ConditionExpression: '#s = :prev',
        ExpressionAttributeNames: { '#s': 'status' },
        ExpressionAttributeValues: { ':c': 'CANCELLED', ':u': new Date().toISOString(), ':prev': 'CONFIRMED' }
      })
    );
    return { ok: true };
  } catch (err) {
    logLambdaError(correlationId, 'orders.update.cancel', err);
    return { ok: false, error: 'CANCEL_UPDATE_FAILED' };
  }
}
