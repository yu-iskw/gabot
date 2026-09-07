import path from 'node:path';
import { fileURLToPath } from 'node:url';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

import {
  loadWorkspaceDirectory,
  proxyApiRequest,
  toPublicWorkspaceListing,
  WORKSPACE_SLUG_HEADER,
} from './server/workspace-proxy.ts';

const root = path.dirname(fileURLToPath(import.meta.url));
const directoryPath =
  process.env.GABOT_WORKSPACE_DIRECTORY ?? path.join(root, 'workspace-directory.host.json');

function workspaceApiProxy(): Plugin {
  const directory = loadWorkspaceDirectory(directoryPath);
  return {
    name: 'gabot-workspace-api-proxy',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const urlPath = req.url?.split('?')[0] ?? '';
        if (urlPath === '/workspace-directory.json') {
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify(toPublicWorkspaceListing(directory)));
          return;
        }
        if (!urlPath.startsWith('/api')) {
          next();
          return;
        }
        void (async () => {
          const host = req.headers.host ?? '127.0.0.1';
          const requestUrl = new URL(req.url ?? '/api', `http://${host}`);
          const chunks: Buffer[] = [];
          for await (const chunk of req) {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
          }
          const method = req.method ?? 'GET';
          const body =
            method === 'GET' || method === 'HEAD' ? undefined : Buffer.concat(chunks).buffer;
          const headers = new Headers();
          for (const [key, value] of Object.entries(req.headers)) {
            if (typeof value === 'string') {
              headers.set(key, value);
            } else if (Array.isArray(value)) {
              headers.set(key, value.join(','));
            }
          }
          const response = await proxyApiRequest({
            directory,
            slugHeader: headers.get(WORKSPACE_SLUG_HEADER) ?? undefined,
            method,
            path: requestUrl.pathname,
            search: requestUrl.search,
            headers,
            body,
          });
          res.statusCode = response.status;
          response.headers.forEach((value, key) => {
            if (key.toLowerCase() === 'transfer-encoding') {
              return;
            }
            res.setHeader(key, value);
          });
          res.end(Buffer.from(await response.arrayBuffer()));
        })().catch((error: unknown) => {
          next(error);
        });
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), workspaceApiProxy()],
  resolve: {
    alias: {
      '@': path.resolve(root, './src'),
    },
  },
  server: {
    host: true,
    port: 3010,
  },
  preview: {
    host: true,
    port: 3010,
  },
});
