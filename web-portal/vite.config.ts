import { existsSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

const __dirname = dirname(fileURLToPath(import.meta.url));
/** Parent of `web-portal/` = monorepo `supply-chain/` (shared `.env`). */
const supplyChainRoot = resolve(__dirname, '..');

export default defineConfig(({ mode }) => {
  const genDir = join(supplyChainRoot, '.generated');
  const envFromRoot = loadEnv(mode, supplyChainRoot, 'VITE_');
  const envFromGen = existsSync(join(genDir, '.env')) ? loadEnv(mode, genDir, 'VITE_') : {};
  const merged = { ...envFromRoot, ...envFromGen };
  const define =
    Object.keys(merged).length > 0
      ? Object.fromEntries(Object.entries(merged).map(([k, v]) => [`import.meta.env.${k}`, JSON.stringify(v ?? '')]))
      : undefined;

  return {
    plugins: [react()],
    server: { port: 5174 },
    envDir: supplyChainRoot,
    ...(define ? { define } : {})
  };
});
