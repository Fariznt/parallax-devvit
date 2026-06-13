import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import tailwind from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mockApiPort = process.env.MOCK_API_PORT ?? '3001';
const uiPreviewPort = Number(process.env.UI_PREVIEW_PORT ?? 7474);

export default defineConfig(({ command }) => ({
  plugins: [react(), tailwind()],
  logLevel: 'warn',
  ...(command === 'serve'
    ? {
        resolve: {
          alias: {
            '@devvit/web/client': path.resolve(__dirname, 'Agent-UI-Viewer/stub-devvit-client.ts'),
          },
        },
      }
    : {}),
  server: {
    host: '127.0.0.1',
    port: uiPreviewPort,
    strictPort: true,
    proxy: {
      '/api': `http://127.0.0.1:${mockApiPort}`,
    },
  },
  build: {
    outDir: '../../dist/client',
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      input: {
        inline: 'inline.html',
        main: 'main.html',
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: '[name].js',
        assetFileNames: '[name][extname]',
        sourcemapFileNames: '[name].js.map',
      },
    },
  },
}));
