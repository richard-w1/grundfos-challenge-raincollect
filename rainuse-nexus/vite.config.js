import path from 'path'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const projectRoot = path.resolve(__dirname, '..')
  const env = {
    ...loadEnv(mode, projectRoot, ''),
    ...loadEnv(mode, __dirname, ''),
  }

  const shovelsKey = env.SHOVELS_KEY || env.VITE_SHOVELS_KEY

  return {
    plugins: [react()],
    envDir: projectRoot,
    server: {
      proxy: {
        '/shovels-api': {
          target: 'https://api.shovels.ai',
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/shovels-api/, '/v2'),
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq) => {
              proxyReq.setHeader('X-API-Key', shovelsKey)
            })
          },
        },
      },
    },
  }
})
