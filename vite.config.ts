import { tanstackRouter } from '@tanstack/router-plugin/vite';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    // Must precede the React plugin — it generates routeTree.gen.ts, which
    // React Fast Refresh then needs to see.
    tanstackRouter({ target: 'react', autoCodeSplitting: true }),
    react(),
    tailwindcss(),
  ],
  // Native since Vite 8; the vite-tsconfig-paths plugin is no longer needed.
  resolve: { tsconfigPaths: true },
  server: {
    // Pinned, and strict so it fails loudly rather than drifting to 5174 when
    // 5173 is busy. A drifting port silently breaks auth: the backend's
    // trusted-origin allowlist names this exact origin, so every
    // /api/v1/web/ call would 403 with no clue why.
    port: 5173,
    strictPort: true,
    proxy: {
      // Mandatory, not a CORS convenience. The refresh cookie is host-only and
      // SameSite=Lax, so a browser on :5173 talking directly to the API on
      // :8000 would never receive or return it. Proxying makes the app
      // same-origin with the API, exactly as it will be when deployed.
      //
      // `changeOrigin: true` rewrites Host but NOT Origin, so the backend still
      // sees http://localhost:5173 — which is why that origin has to be in the
      // backend's CORS_ALLOWED_ORIGINS (it is, as of surgiscribe-backend#31).
      '/api': {
        target: process.env.VITE_PROXY_TARGET ?? 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: 'jsdom',
    // Pin the origin so relative MSW handlers and axios' relative baseURL
    // resolve to the same place regardless of jsdom's default.
    environmentOptions: { jsdom: { url: 'http://localhost:5173/' } },
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    exclude: ['**/node_modules/**', '**/dist/**', '**/e2e/**'],
  },
});
