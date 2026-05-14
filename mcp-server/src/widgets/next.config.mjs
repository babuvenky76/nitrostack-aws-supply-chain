import { existsSync } from 'fs';
import { loadEnvConfig } from '@next/env';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
/** `mcp-server/src/widgets` → `supply-chain/` (shared `.env`). */
const supplyChainRoot = resolve(__dirname, '../../..');
const generatedRoot = join(supplyChainRoot, '.generated');
loadEnvConfig(supplyChainRoot);
if (existsSync(join(generatedRoot, '.env'))) {
  loadEnvConfig(generatedRoot);
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@nitrostack/widgets'],
  ...(process.env.NODE_ENV === 'production' && {
    output: 'export',
    distDir: 'out',
    images: { unoptimized: true }
  })
};

export default nextConfig;
