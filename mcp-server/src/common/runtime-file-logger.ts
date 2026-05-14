/**
 * @file runtime-file-logger.ts
 * @summary Append structured JSON lines to `supply-chain/.supply-chain-runtime.log` for MCP debugging (local dev / NitroStudio).
 * @context Node MCP only — not used in AWS Lambda (Lambdas use CloudWatch).
 * @debugging Tail the log file alongside stderr; each line is one JSON object with `time`, `level`, `where`, `correlationId`, etc.
 */

import { appendFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

function resolveSupplyChainRoot(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  // mcp-server/src/common → …/supply-chain
  return join(here, '..', '..', '..');
}

/** Append one JSON line (best-effort; never throws). */
export function appendRuntimeLog(entry: Record<string, unknown>): void {
  const path = join(resolveSupplyChainRoot(), '.supply-chain-runtime.log');
  const line = JSON.stringify({ time: new Date().toISOString(), ...entry }) + '\n';
  try {
    appendFileSync(path, line, 'utf8');
  } catch {
    // Permission or disk issues — avoid crashing the MCP; stderr remains primary.
  }
}
