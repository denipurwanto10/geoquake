import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    proxy: {
      '/bmkg': {
        target: 'https://data.bmkg.go.id',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/bmkg/, ''),
      }
    }
  },
  build: {
    outDir: 'dist',
  }
})
