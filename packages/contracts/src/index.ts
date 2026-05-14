/**
 * @file index.ts
 * @summary Shared Zod contracts and Lambda observability helpers for the supply-chain services.
 * @context Imported by catalog, inventory, and orders Lambdas and MCP tooling.
 * @debugging Validation failures return Zod `flatten()` from handlers; Lambda errors use `lambda-observability`.
 */

import { z } from 'zod';

export {
  logLambdaError,
  userFacing500Message,
  safeJsonParse,
  safeInvokeJsonParse
} from './lambda-observability.js';

export const productSchema = z.object({
  productId: z.string().min(1),
  sku: z.string().min(1),
  name: z.string().min(1),
  unitPriceCents: z.number().int().nonnegative()
});
export type Product = z.infer<typeof productSchema>;

export const inventoryRecordSchema = z.object({
  sku: z.string().min(1),
  quantityAvailable: z.number().int().nonnegative(),
  quantityReserved: z.number().int().nonnegative()
});
export type InventoryRecord = z.infer<typeof inventoryRecordSchema>;

export const orderLineSchema = z.object({
  sku: z.string().min(1),
  quantity: z.number().int().positive()
});

export const createOrderSchema = z.object({
  customerRef: z.string().min(1).max(128),
  lines: z.array(orderLineSchema).min(1).max(50)
});
export type CreateOrderInput = z.infer<typeof createOrderSchema>;

export const orderRecordSchema = z.object({
  orderId: z.string().min(1),
  customerRef: z.string(),
  status: z.enum(['CONFIRMED', 'CANCELLED']),
  lines: z.array(
    z.object({
      sku: z.string(),
      quantity: z.number().int().positive(),
      unitPriceCents: z.number().int().nonnegative()
    })
  ),
  createdAt: z.string(),
  updatedAt: z.string()
});
export type OrderRecord = z.infer<typeof orderRecordSchema>;

export const reserveRequestSchema = z.object({
  reservationId: z.string().min(1),
  sku: z.string().min(1),
  quantity: z.number().int().positive()
});

export const releaseRequestSchema = z.object({
  reservationId: z.string().min(1),
  sku: z.string().min(1),
  quantity: z.number().int().positive()
});
