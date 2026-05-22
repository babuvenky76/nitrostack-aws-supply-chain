/**
 * @file http-response.ts
 * @summary HTTP response formatting used by all Lambda handlers.
 * @context Provides consistent JSON response structure with correlation IDs and proper status codes.
 * @usage Import and use json() function in handler.ts files to ensure consistency across services.
 */

/**
 * Formats a standard HTTP JSON response with correlation ID tracking
 * @param statusCode - HTTP status code
 * @param body - Response body (will be JSON stringified)
 * @param correlationId - Request correlation ID for tracing
 * @returns Lambda proxy integration response
 */
export function json(statusCode: number, body: unknown, correlationId: string) {
  return {
    statusCode,
    headers: {
      'content-type': 'application/json',
      'x-correlation-id': correlationId,
      'cache-control': 'no-cache, no-store, must-revalidate'
    },
    body: JSON.stringify(body)
  };
}

/**
 * Formats an error response with standard error structure
 * @param statusCode - HTTP status code (typically 4xx or 5xx)
 * @param code - Error code for client to identify error type
 * @param message - Human-readable error message
 * @param correlationId - Request correlation ID
 * @param details - Optional additional error details
 * @returns Lambda proxy integration response
 */
export function errorResponse(
  statusCode: number,
  code: string,
  message: string,
  correlationId: string,
  details?: unknown
) {
  return json(
    statusCode,
    {
      ok: false,
      error: {
        code,
        message,
        ...(details && { details })
      }
    },
    correlationId
  );
}

/**
 * Formats a success response
 * @param data - Response data
 * @param correlationId - Request correlation ID
 * @param statusCode - HTTP status code (default: 200)
 * @returns Lambda proxy integration response
 */
export function successResponse(data: unknown, correlationId: string, statusCode = 200) {
  return json(statusCode, { ok: true, ...data }, correlationId);
}

/**
 * Formats a 404 Not Found error
 */
export function notFoundError(message: string, correlationId: string) {
  return errorResponse(404, 'NOT_FOUND', message, correlationId);
}

/**
 * Formats a 400 Bad Request error
 */
export function badRequestError(message: string, correlationId: string, details?: unknown) {
  return errorResponse(400, 'BAD_REQUEST', message, correlationId, details);
}

/**
 * Formats a 409 Conflict error
 */
export function conflictError(message: string, correlationId: string, details?: unknown) {
  return errorResponse(409, 'CONFLICT', message, correlationId, details);
}

/**
 * Formats a 413 Payload Too Large error
 */
export function payloadTooLargeError(message: string, correlationId: string) {
  return errorResponse(413, 'PAYLOAD_TOO_LARGE', message, correlationId);
}

/**
 * Formats a 500 Internal Server Error (with generic message for security)
 */
export function internalServerError(correlationId: string) {
  return errorResponse(
    500,
    'INTERNAL_SERVER_ERROR',
    `An error occurred. Please contact support with this correlation ID: ${correlationId}`,
    correlationId
  );
}
