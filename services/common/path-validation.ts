/**
 * @file path-validation.ts
 * @summary Strict path parameter validation to prevent traversal attacks and injection.
 * @context Used by all Lambda handlers (catalog, orders, inventory) to validate productId, orderId, skuId.
 * @security Enforces UUID v4 format for IDs and alphanumeric for SKUs to prevent path traversal.
 */

/**
 * Validates parameter is a valid UUID v4 format
 * @param id - The ID to validate
 * @throws {Error} if format is invalid
 * @returns The validated ID
 */
export function validateUUID(id: string | undefined): string {
  if (!id) throw new Error('ID is required');

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(id)) {
    throw new Error(`Invalid ID format: must be UUID v4, got "${id}"`);
  }
  return id;
}

/**
 * Safely extract and validate UUID from URL path using regex pattern
 * @param path - The URL path to extract from
 * @param pattern - Regex pattern with capturing group for the ID
 * @returns The validated UUID
 * @throws {Error} if path format is invalid or ID doesn't match UUID format
 */
export function extractUUIDFromPath(path: string, pattern: RegExp): string {
  const match = path.match(pattern);
  if (!match?.[1]) {
    throw new Error('Invalid path format: ID parameter not found');
  }
  return validateUUID(match[1]);
}

/**
 * Validates SKU format (alphanumeric, dash, underscore only)
 * @param sku - The SKU to validate
 * @throws {Error} if format is invalid
 * @returns The validated SKU
 */
export function validateSKU(sku: string | undefined): string {
  if (!sku) throw new Error('SKU is required');

  if (sku.length > 50) {
    throw new Error(`SKU too long: max 50 characters, got ${sku.length}`);
  }

  const skuRegex = /^[A-Za-z0-9_-]{1,50}$/;
  if (!skuRegex.test(sku)) {
    throw new Error(`Invalid SKU format: must be alphanumeric + dash/underscore, got "${sku}"`);
  }
  return sku;
}

/**
 * Validates customer reference format
 * @param customerRef - The customer reference to validate
 * @throws {Error} if format is invalid
 * @returns The validated customer reference
 */
export function validateCustomerRef(customerRef: string | undefined): string {
  if (!customerRef) throw new Error('Customer reference is required');

  if (customerRef.length > 255) {
    throw new Error(`Customer ref too long: max 255 characters, got ${customerRef.length}`);
  }

  if (customerRef.trim().length === 0) {
    throw new Error('Customer reference cannot be empty or whitespace only');
  }

  return customerRef;
}
