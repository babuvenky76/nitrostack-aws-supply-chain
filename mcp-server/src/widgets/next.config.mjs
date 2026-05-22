import { existsSync } from 'fs';
import pkg from '@next/env';
const { loadEnvConfig } = pkg;
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
  env: {
    VITE_COGNITO_AUTHORITY: process.env.VITE_COGNITO_AUTHORITY || process.env.NEXT_PUBLIC_COGNITO_AUTHORITY,
    VITE_COGNITO_WEB_CLIENT_ID: process.env.VITE_COGNITO_WEB_CLIENT_ID || process.env.NEXT_PUBLIC_COGNITO_WEB_CLIENT_ID,
    VITE_AWS_HTTP_API_BASE_URL: process.env.VITE_AWS_HTTP_API_BASE_URL || process.env.NEXT_PUBLIC_AWS_HTTP_API_BASE_URL,
    NEXT_PUBLIC_COGNITO_AUTHORITY: process.env.NEXT_PUBLIC_COGNITO_AUTHORITY || process.env.VITE_COGNITO_AUTHORITY,
    NEXT_PUBLIC_COGNITO_WEB_CLIENT_ID: process.env.NEXT_PUBLIC_COGNITO_WEB_CLIENT_ID || process.env.VITE_COGNITO_WEB_CLIENT_ID,
    NEXT_PUBLIC_AWS_HTTP_API_BASE_URL: process.env.NEXT_PUBLIC_AWS_HTTP_API_BASE_URL || process.env.VITE_AWS_HTTP_API_BASE_URL,
  },
  ...(process.env.NODE_ENV === 'production' && {
    output: 'export',
    distDir: 'out',
    images: { unoptimized: true }
  })
};

export default nextConfig;
