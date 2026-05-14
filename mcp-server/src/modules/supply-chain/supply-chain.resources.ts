/**
 * @file supply-chain.resources.ts
 * @summary MCP `@Resource` — architecture and SDK notes for Studio documentation surfaces.
 */

import { ResourceDecorator as Resource, Injectable, ExecutionContext } from '@nitrostack/core';

@Injectable({ deps: [] })
export class SupplyChainResources {
  @Resource({
    uri: 'supply-chain://bounded-contexts',
    name: 'Bounded contexts & sequence',
    description: 'How catalog, inventory, and orders interact in this AWS deployment.'
  })
  async boundedContexts(_ctx: ExecutionContext) {
    return {
      contexts: [
        {
          name: 'catalog',
          responsibility: 'Authoritative product definitions and pricing (DynamoDB products table).',
          exposes: ['GET /v1/catalog/products', 'GET /v1/catalog/products/{productId}', 'internal getBySku for orders']
        },
        {
          name: 'inventory',
          responsibility: 'Stock movement with conditional updates (DynamoDB inventory table).',
          exposes: ['Lambda invoke only — reserve / release called by orders']
        },
        {
          name: 'orders',
          responsibility: 'Happy-path ordering: validate SKUs, reserve stock, persist orders, cancel with releases.',
          dependsOn: ['catalog (internal invoke)', 'inventory (internal invoke)', 'DynamoDB orders table + GSI1'],
          exposes: ['POST /v1/orders', 'GET /v1/orders', 'GET /v1/orders/{orderId}', 'POST /v1/orders/{orderId}/cancel']
        }
      ],
      sequence: [
        '1) Catalog seeds real SKUs and prices.',
        '2) Inventory rows hold real quantityAvailable.',
        '3) Orders validates each line against catalog, reserves inventory, writes the order.',
        '4) Cancel releases inventory then marks the order CANCELLED.'
      ]
    };
  }

  @Resource({
    uri: 'supply-chain://nitrostack-surface',
    name: 'NitroStack features used here',
    description: 'Mapping from NitroStack primitives to this repository.'
  })
  async nitrostackSurface(_ctx: ExecutionContext) {
    return {
      sdk: ['@Tool with Zod inputSchema', '@Widget for Studio UI', '@Resource for architecture docs', '@Prompt for LLM-ready templates', '@RateLimit', '@HealthCheck (system + AWS STS)'],
      studio: [
        'Run `nitrostack-cli dev` and attach NitroStack Studio to this folder — tools, resources, prompts, and widgets light up together.'
      ],
      nitrochat: ['Placeholder — see docs/NITROCHAT.md for the planned white-label chat integration.'],
      widgets: ['Next.js widget bundle (`src/widgets`) built with `@nitrostack/widgets` SDK patterns from the Automotive reference.']
    };
  }
}
