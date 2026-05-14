/**
 * @file file-log.ts
 * @summary Append JSON lines to `supply-chain/.supply-chain-runtime.log` from CLI scripts (seed, etc.).
 * @context Same log file as MCP `runtime-file-logger.ts` for a single tail during local debugging.
 */

import { appendFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const supplyChainRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

export function appendScriptLog(entry: Record<string, unknown>): void {
  const line = JSON.stringify({ time: new Date().toISOString(), ...entry }) + '\n';
  try {
    appendFileSync(join(supplyChainRoot, '.supply-chain-runtime.log'), line, 'utf8');
  } catch {
    // ignore
  }
}
