import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

const certsDir = resolve(__dirname, 'certs')
const certPath = resolve(certsDir, 'cert.pem')
const keyPath  = resolve(certsDir, 'key.pem')
const hasCerts = existsSync(certPath) && existsSync(keyPath)

if (!hasCerts) {
  console.warn('[vite] HTTPS certs not found in apps/web/certs/ — running HTTP only. Run mkcert to enable HTTPS.')
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: true,
    ...(hasCerts && {
      https: {
        cert: readFileSync(certPath),
        key: readFileSync(keyPath),
      },
    }),
    proxy: {
      // Proxy WebSocket through Vite so HTTPS pages can use WSS
      '/ws': {
        target: 'ws://localhost:3001',
        ws: true,
        rewrite: (path) => path.replace(/^\/ws/, ''),
      },
      // Proxy REST endpoints so HTTPS pages can reach the HTTP server
      '/api': {
        target: 'http://localhost:3000',
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
})
