/**
 * @file lambda-observability.ts
 * @summary Structured logging and safe error surfacing for AWS Lambda handlers (CloudWatch).
 * @context Used only by Node Lambdas in `services/*`. Logs go to stdout/stderr → CloudWatch Logs.
 * @debugging Search CloudWatch by `correlationId` or `where`. Full stack in `stack` field.
 */

/** JSON line to stderr (CloudWatch). Always include correlationId for traceability. */
export function logLambdaError(correlationId: string, where: string, err: unknown, extra?: Record<string, unknown>): void {
  const stack = err instanceof Error ? err.stack : undefined;
  const message = err instanceof Error ? err.message : String(err);
  console.error(
    JSON.stringify({
      level: 'ERROR',
      time: new Date().toISOString(),
      correlationId,
      where,
      message,
      stack,
      ...extra
    })
  );
}

/**
 * Client-safe message for HTTP 5xx bodies. Internal details stay in CloudWatch via {@link logLambdaError}.
 * Always include correlationId so support can correlate with logs.
 */
export function userFacing500Message(correlationId: string): string {
  return `We could not complete this request. Please try again. If the problem continues, contact support with reference: ${correlationId}`;
}

/** Parse request body JSON without throwing; returns SyntaxError as err on failure. */
export function safeJsonParse(raw: string, correlationId: string): { ok: true; value: unknown } | { ok: false; err: SyntaxError } {
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch (e) {
    const syn = e instanceof SyntaxError ? e : new SyntaxError('Invalid JSON');
    logLambdaError(correlationId, 'json.parse', syn, { snippet: raw.length > 200 ? `${raw.slice(0, 200)}…` : raw });
    return { ok: false, err: syn };
  }
}

/** Parse Lambda invoke payload JSON safely (peer Lambda responses). */
export function safeInvokeJsonParse<T>(raw: string, correlationId: string, where: string): { ok: true; value: T } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(raw) as T };
  } catch (e) {
    logLambdaError(correlationId, where, e, { rawLength: raw.length });
    return { ok: false };
  }
}
