import { format } from 'util';

/**
 * @file index.ts
 * @summary NitroStack MCP process entry — env bootstrap, fatal logging, server start.
 * @context Run via `nitrostack-cli dev` from `mcp-server/`. Logs: stderr + `.mcp-bootstrap-error.log` + `.supply-chain-runtime.log`.
 */

const stderrLine = (msg: string) => process.stderr.write(msg + '\n');
console.log = (...a: unknown[]) => stderrLine(format(...a));
console.info = console.log;
console.warn = (...a: unknown[]) => stderrLine(format(...a));
console.debug = console.log;

import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, writeFileSync } from 'fs';
import { McpApplicationFactory } from '@nitrostack/core';
import { appendRuntimeLog } from './common/runtime-file-logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
/**
 * `mcp-server/dist` or `mcp-server/src` → monorepo `supply-chain/` (two levels up).
 * Env load order: `.generated/.env` then `.env` (override) so AWS keys always win.
 */
const supplyChainRoot = join(__dirname, '..', '..');
const generatedEnvPath = join(supplyChainRoot, '.generated', '.env');
const envPath = join(supplyChainRoot, '.env');
if (existsSync(generatedEnvPath)) {
  config({ path: generatedEnvPath });
}
config({ path: envPath, override: true });

const BOOTSTRAP_ERROR_LOG = join(supplyChainRoot, '.mcp-bootstrap-error.log');

function logFatal(message: string, err: unknown) {
  const stack = err instanceof Error ? err.stack : String(err);
  const text = `${message}\n${stack}\n`;
  process.stderr.write(text);
  appendRuntimeLog({
    level: 'FATAL',
    message,
    stack: err instanceof Error ? err.stack : String(err)
  });
  try {
    writeFileSync(BOOTSTRAP_ERROR_LOG, `${new Date().toISOString()}\n${text}`, 'utf8');
  } catch (_) {}
}

process.on('uncaughtException', (err) => {
  logFatal('[SupplyChain-MCP] Uncaught exception (server will exit):', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logFatal('[SupplyChain-MCP] Unhandled rejection (server may exit):', reason);
  process.exit(1);
});

async function bootstrap() {
  const { AppModule } = await import('./app.module.js');
  const server = await McpApplicationFactory.create(AppModule);
  await server.start();
}

bootstrap().catch((err) => {
  logFatal('[SupplyChain-MCP] Bootstrap failed:', err);
  process.exit(1);
});
