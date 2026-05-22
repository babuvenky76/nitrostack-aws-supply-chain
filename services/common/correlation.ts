/**
 * @file correlation.ts
 * @summary Correlation ID management for request tracing across services.
 * @context Extracts correlation ID from request headers or generates new UUID if missing.
 * @usage Use readCorrelationId() at the start of every handler to enable request tracing.
 */

import { randomUUID } from 'node:crypto';

/**
 * Extracts or generates a correlation ID for request tracing
 * @param event - Lambda event with optional headers
 * @returns Correlation ID string (either from header or newly generated UUID)
 */
export function readCorrelationId(event: { headers?: Record<string, string | undefined> }): string {
  if (!event.headers) {
    return randomUUID();
  }

  // Find x-correlation-id header (case-insensitive)
  const key = Object.keys(event.headers).find((k) => k.toLowerCase() === 'x-correlation-id');
  if (!key) {
    return randomUUID();
  }

  const found = event.headers[key];
  if (found && found.trim()) {
    return found.trim();
  }

  return randomUUID();
}

/**
 * Validates that a correlation ID is in valid format
 * @param id - The correlation ID to validate
 * @returns true if valid (UUID format or valid hex)
 */
export function isValidCorrelationId(id: string): boolean {
  // Accept UUID or hex string format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const hexRegex = /^[0-9a-f]+$/i;
  return uuidRegex.test(id) || (hexRegex.test(id) && id.length >= 8);
}
