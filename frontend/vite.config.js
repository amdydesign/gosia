import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import path from 'node:path'

// OCR runs in the browser and its files are served from our own server (no CDN):
// tesseract worker, the SIMD+LSTM wasm core and the Polish model -> build/ocr/
const OCR_FILES = {
  'worker.min.js': 'node_modules/tesseract.js/dist/worker.min.js',
  'tesseract-core-simd-lstm.wasm.js': 'node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm.js',
  'pol.traineddata.gz': 'node_modules/@tesseract.js-data/pol/4.0.0_best_int/pol.traineddata.gz',
}

function ocrAssets() {
  return {
    name: 'ocr-assets',
    configureServer(server) {
      server.middlewares.use('/ocr/', (req, res, next) => {
        const src = OCR_FILES[req.url.replace(/^\//, '').split('?')[0]]
        if (!src) return next()
        fs.createReadStream(path.resolve(src)).pipe(res)
      })
    },
    closeBundle() {
      const dir = path.resolve('../build/ocr')
      fs.mkdirSync(dir, { recursive: true })
      for (const [name, src] of Object.entries(OCR_FILES)) fs.copyFileSync(path.resolve(src), path.join(dir, name))
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), ocrAssets()],
  server: {
    port: 5173,
    allowedHosts: true,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, '')
      }
    }
  },
  build: {
    outDir: '../build',
    emptyOutDir: true,
    sourcemap: false,
  }
})
