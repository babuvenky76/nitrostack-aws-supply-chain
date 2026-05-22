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

// Robustly search for the supply chain root directory (which contains '.generated' and '.env')
const candidateRoots = [
  join(__dirname, '..', '..'),
  join(__dirname, '..'),
  '/Users/babusrinivasan/Projects/NitroStack/module-repos/aws/supply-chain',
  process.cwd(),
  join(process.cwd(), '..')
];

let supplyChainRoot = '';
for (const cand of candidateRoots) {
  if (existsSync(join(cand, '.env')) || existsSync(join(cand, '.generated', '.env'))) {
    supplyChainRoot = cand;
    break;
  }
}
if (!supplyChainRoot) {
  supplyChainRoot = '/Users/babusrinivasan/Projects/NitroStack/module-repos/aws/supply-chain';
}

const generatedEnvPath = join(supplyChainRoot, '.generated', '.env');
const envPath = join(supplyChainRoot, '.env');

process.stderr.write(`[SupplyChain-MCP] Loading env from: ${envPath} and ${generatedEnvPath}\n`);

if (existsSync(generatedEnvPath)) {
  config({ path: generatedEnvPath });
}
config({ path: envPath, override: true });

process.stderr.write(`[SupplyChain-MCP] Loaded VITE_COGNITO_WEB_CLIENT_ID: ${process.env.VITE_COGNITO_WEB_CLIENT_ID || 'MISSING'}\n`);

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
