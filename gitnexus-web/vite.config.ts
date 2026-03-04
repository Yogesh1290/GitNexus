import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import path from 'path';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    wasm(),
    topLevelAwait(),
    // Copy kuzu-wasm worker file to assets folder for production
    viteStaticCopy({
      targets: [
        {
          src: 'node_modules/kuzu-wasm/kuzu_wasm_worker.js',
          dest: 'assets'
        }
      ]
    }),
    // Custom Backend Proxy for Local Development (Simulates Vercel Serverless Functions)
    {
      name: 'gitnexus-cors-proxy',
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          if (req.url?.startsWith('/api/proxy-bundle')) {
            const urlParams = new URLSearchParams(req.url.split('?')[1]);
            const targetUrl = urlParams.get('url');

            if (!targetUrl) {
              res.statusCode = 400;
              return res.end('Missing URL parameter');
            }

            try {
              // Node.js backend fetch (Bypasses Browser CORS)
              const response = await fetch(targetUrl);

              if (!response.ok) {
                res.statusCode = response.status;
                return res.end(`Failed to fetch from target: ${response.statusText}`);
              }

              // Copy over relevant headers (Content-Type, Content-Length)
              response.headers.forEach((value, key) => {
                res.setHeader(key, value);
              });

              // Ensure CORS is allowed for the WebContainer iframe
              res.setHeader('Access-Control-Allow-Origin', '*');
              res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
              res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');

              // Stream the binary bundle back to the client
              const arrayBuffer = await response.arrayBuffer();
              res.end(Buffer.from(arrayBuffer));
            } catch (err: any) {
              res.statusCode = 500;
              res.end(`Proxy Error: ${err.message}`);
            }
          } else {
            next();
          }
        });
      }
    }
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // Fix for Rollup failing to resolve this deep import from @langchain/anthropic
      '@anthropic-ai/sdk/lib/transform-json-schema': path.resolve(__dirname, 'node_modules/@anthropic-ai/sdk/lib/transform-json-schema.mjs'),
      // Fix for mermaid d3-color prototype crash on Vercel (known issue with mermaid 10.9.0+ and Vite)
      'mermaid': path.resolve(__dirname, 'node_modules/mermaid/dist/mermaid.esm.min.mjs'),
    },
  },
  // Polyfill Buffer for isomorphic-git (Node.js API needed in browser)
  define: {
    global: 'globalThis',
  },
  // Optimize deps - exclude kuzu-wasm from pre-bundling (it has WASM files)
  optimizeDeps: {
    exclude: ['kuzu-wasm'],
    include: ['buffer'],
  },
  // Required for KuzuDB WASM (SharedArrayBuffer needs Cross-Origin Isolation)
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
    // Allow serving files from node_modules
    fs: {
      allow: ['..'],
    },
  },
  // Also set for preview/production builds
  preview: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  // Worker configuration
  worker: {
    format: 'es',
    plugins: () => [wasm(), topLevelAwait()],
  },
});
