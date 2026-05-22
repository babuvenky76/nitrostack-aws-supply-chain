/**
 * @file request-limits.ts
 * @summary Request size and complexity limits to prevent DDoS attacks and resource exhaustion.
 * @context Used by Lambda handlers to validate incoming request payloads before processing.
 * @security Enforces strict limits on body size, array lengths, and numeric values.
 */

export const REQUEST_LIMITS = {
  MAX_BODY_SIZE: 10 * 1024, // 10 KB
  MAX_ORDER_LINES: 100, // Max items per order
  MAX_INVENTORY_QUANTITY: 1_000_000, // Max qty per line
  MAX_CUSTOMER_REF_LENGTH: 255, // Customer reference max length
};

/**
 * Response type for request size validation
 */
export type ValidationResult =
  | { ok: true }
  | { ok: false; error: { code: string; message: string } };

/**
 * Validates request body size doesn't exceed limit
 * @param event - Lambda event with optional body
 * @param correlationId - For logging
 * @returns Validation result
 */
export function validateRequestSize(
  event: { body?: string; isBase64Encoded?: boolean },
  _correlationId: string
): ValidationResult {
  if (!event.body) return { ok: true };

  const bodySize = event.isBase64Encoded
    ? Buffer.byteLength(event.body, 'base64')
    : Buffer.byteLength(event.body, 'utf8');

  if (bodySize > REQUEST_LIMITS.MAX_BODY_SIZE) {
    return {
      ok: false,
      error: {
        code: 'PAYLOAD_TOO_LARGE',
        message: `Request body exceeds ${REQUEST_LIMITS.MAX_BODY_SIZE} bytes (size: ${bodySize})`
      }
    };
  }

  return { ok: true };
}

/**
 * Validates order lines array doesn't exceed limit
 * @param lines - Array of order lines
 * @throws {Error} if validation fails
 */
export function validateOrderLines(lines: unknown[]): void {
  if (!Array.isArray(lines)) {
    throw new Error('Lines must be an array');
  }

  if (lines.length === 0) {
    throw new Error('At least one line is required');
  }

  if (lines.length > REQUEST_LIMITS.MAX_ORDER_LINES) {
    throw new Error(`Too many lines: max ${REQUEST_LIMITS.MAX_ORDER_LINES}, got ${lines.length}`);
  }
}

/**
 * Validates inventory quantity is within limits
 * @param quantity - The quantity to validate
 * @throws {Error} if validation fails
 */
export function validateQuantity(quantity: unknown): number {
  if (typeof quantity !== 'number') {
    throw new Error('Quantity must be a number');
  }

  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new Error('Quantity must be a positive integer');
  }

  if (quantity > REQUEST_LIMITS.MAX_INVENTORY_QUANTITY) {
    throw new Error(
      `Quantity too large: max ${REQUEST_LIMITS.MAX_INVENTORY_QUANTITY}, got ${quantity}`
    );
  }

  return quantity;
}
