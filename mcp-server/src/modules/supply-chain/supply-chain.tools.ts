/**
 * @file supply-chain.tools.ts
 * @summary MCP `@Tool` + `@Widget` — dispatches actions to {@link SupplyChainApiService} (real AWS HTTP API).
 * @context Rate-limited; errors return a friendly `userMessage` and log to `.supply-chain-runtime.log`.
 */

import {
  ToolDecorator as Tool,
  Widget,
  ExecutionContext,
  Injectable,
  z,
  RateLimit
} from '@nitrostack/core';
import { SupplyChainApiService } from '../../common/supply-chain-api.service.js';
import { appendRuntimeLog } from '../../common/runtime-file-logger.js';

const actions = [
  'catalog_list',
  'catalog_get',
  'order_create',
  'order_list',
  'order_get',
  'order_cancel'
] as const;

type Action = (typeof actions)[number];

function isAction(s: unknown): s is Action {
  return typeof s === 'string' && (actions as readonly string[]).includes(s);
}

const inputSchema = z
  .object({
    action: z.enum(actions).describe('Which supply-chain operation to run against AWS'),
    productId: z.string().optional().describe('For catalog_get / order flows referencing a SKU-as-productId'),
    orderId: z.string().min(1).optional().describe('For order_get / order_cancel'),
    customerRef: z.string().optional().describe('Opaque customer reference for order_create'),
    lines: z
      .array(z.object({ sku: z.string(), quantity: z.number().int().positive() }))
      .optional()
      .describe('Line items for order_create')
  })
  .passthrough();

@Injectable({ deps: [SupplyChainApiService] })
export class SupplyChainTools {
  constructor(private readonly api: SupplyChainApiService) {
    process.stderr.write('📦 Supply chain tools initialized (AWS HTTP API + Cognito M2M)\n');
  }

  @Tool({
    name: 'supply_chain',
    title: '📦 Supply chain (AWS)',
    description:
      'Real AWS integration: API Gateway + Cognito + Lambda + DynamoDB. Actions: catalog_list, catalog_get, order_create, order_list, order_get, order_cancel. Uses client-credentials tokens from Secrets Manager.',
    inputSchema
  })
  @Widget('supply-chain-studio')
  @RateLimit({ requests: 120, window: '1m' })
  async run(input: z.infer<typeof inputSchema>, _ctx: ExecutionContext) {
    const correlationId = crypto.randomUUID();
    const action = input.action;
    if (!isAction(action)) {
      return { ok: false, correlationId, error: 'ACTION_REQUIRED', hint: actions };
    }
    try {
      if (action === 'catalog_list') {
        const data = await this.api.listProducts(correlationId);
        return { ok: true, correlationId, data };
      }
      if (action === 'catalog_get') {
        const productId = input.productId;
        if (!productId) return { ok: false, correlationId, error: 'productId required' };
        const data = await this.api.getProduct(correlationId, productId);
        return { ok: true, correlationId, data };
      }
      if (action === 'order_list') {
        const data = await this.api.listOrders(correlationId);
        return { ok: true, correlationId, data };
      }
      if (action === 'order_get') {
        const orderId = input.orderId;
        if (!orderId) return { ok: false, correlationId, error: 'orderId required' };
        const data = await this.api.getOrder(correlationId, orderId);
        return { ok: true, correlationId, data };
      }
      if (action === 'order_cancel') {
        const orderId = input.orderId;
        if (!orderId) return { ok: false, correlationId, error: 'orderId required' };
        const data = await this.api.cancelOrder(correlationId, orderId);
        return { ok: true, correlationId, data };
      }
      if (action === 'order_create') {
        const customerRef = input.customerRef;
        const lines = input.lines;
        if (!customerRef || !lines?.length) {
          return { ok: false, correlationId, error: 'customerRef and lines[] required for order_create' };
        }
        const data = await this.api.createOrder(correlationId, { customerRef, lines });
        return { ok: true, correlationId, data };
      }
      return { ok: false, correlationId, error: 'UNREACHABLE' };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const stack = err instanceof Error ? err.stack : undefined;
      const payload = {
        level: 'ERROR' as const,
        correlationId,
        where: 'SupplyChainTools.run',
        action,
        message,
        stack
      };
      process.stderr.write(JSON.stringify(payload) + '\n');
      appendRuntimeLog(payload);
      const userMessage =
        message.includes('Reference:') || message.includes('authentication')
          ? message
          : `The supply-chain action could not be completed. Use correlation id ${correlationId} with your administrator.`;
      return { ok: false, correlationId, error: userMessage };
    }
  }
}
