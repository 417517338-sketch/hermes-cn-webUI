import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
        // flush: 'manual' 让 res.flush() 直接控制缓冲区，避免 http-proxy 自动缓冲
        flush: 'manual',
        configure(proxy) {
          proxy.on('proxyRes', (proxyRes) => {
            if (proxyRes.headers['content-type']?.includes('text/event-stream')) {
              // 强制关闭代理缓冲
              proxyRes.headers['X-Accel-Buffering'] = 'no'
              if (proxyRes.socket) {
                proxyRes.socket.setTimeout(0)
              }
            }
          })
        },
      },
      '/v1': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
        flush: 'manual',
        configure(proxy) {
          proxy.on('proxyRes', (proxyRes) => {
            if (proxyRes.headers['content-type']?.includes('text/event-stream')) {
              proxyRes.headers['X-Accel-Buffering'] = 'no'
              if (proxyRes.socket) {
                proxyRes.socket.setTimeout(0)
              }
            }
          })
        },
      },
      '/ws': {
        target: 'ws://127.0.0.1:3001',
        ws: true,
        changeOrigin: true,
      },
    },
  },
})
