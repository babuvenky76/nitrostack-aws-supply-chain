/**
 * @file supply-chain.prompts.ts
 * @summary MCP `@Prompt` templates for order acknowledgement and related LLM flows.
 */

import { PromptDecorator as Prompt, Injectable, ExecutionContext } from '@nitrostack/core';

@Injectable({ deps: [] })
export class SupplyChainPrompts {
  @Prompt({
    name: 'order-acknowledgement-draft',
    title: 'Order acknowledgement (customer email)',
    description: 'Draft a concise acknowledgement email after a successful AWS-backed order.',
    arguments: [
      { name: 'orderJson', description: 'JSON of the created order (from POST /v1/orders)', required: true },
      { name: 'customerName', description: 'Recipient display name', required: true }
    ]
  })
  async orderAcknowledgement(args: { orderJson: string; customerName: string }, _ctx: ExecutionContext) {
    return {
      messages: [
        {
          role: 'system',
          content:
            'You are a supply-chain coordinator. Write a short, professional acknowledgement email referencing SKUs, quantities, and order id. Do not invent data not present in orderJson.'
        },
        {
          role: 'user',
          content: `Customer: ${args.customerName}\nOrder JSON:\n${args.orderJson}`
        }
      ]
    };
  }

  @Prompt({
    name: 'catalog-change-summary',
    title: 'Catalog change briefing',
    description: 'Summarize catalog contents for a stand-up note (uses provided JSON only).',
    arguments: [{ name: 'catalogJson', description: 'JSON from GET /v1/catalog/products', required: true }]
  })
  async catalogSummary(args: { catalogJson: string }, _ctx: ExecutionContext) {
    return {
      messages: [
        {
          role: 'system',
          content: 'Summarize the catalog for engineers: highlight SKU, name, and unit price in cents. Stay factual.'
        },
        { role: 'user', content: args.catalogJson }
      ]
    };
  }
}
