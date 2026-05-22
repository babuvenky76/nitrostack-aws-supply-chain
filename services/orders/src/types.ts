/**
 * @file types.ts
 * @summary Shared types for orders service.
 */

import type { Product } from '@supply-chain/contracts';

export type CatalogInternalResponse =
  | { ok: true; product: Product }
  | { ok: false; error: { code: string; message: string; sku?: string } };

export type InventoryInvokeResponse =
  | { ok: true; action: string; sku: string; quantity: number }
  | { ok: false; error: { code: string; message: string; sku?: string; quantity?: number } };

export type OrderCreateRequest = {
  customerRef: string;
  lines: Array<{ sku: string; quantity: number }>;
};

export type Reservation = { sku: string; quantity: number; reservationId: string };
