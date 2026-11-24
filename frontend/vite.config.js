import {defineConfig} from 'vite'
import react from '@vitejs/plugin-react'

// 本地后端地址，默认 8080；同时跑多个后端时用 PLATFORM_BACKEND=http://127.0.0.1:8091 指定
const backend = process.env.PLATFORM_BACKEND || 'http://127.0.0.1:8080'

export default defineConfig({
    plugins: [react()],
    test: {
        environment: 'jsdom',
        globals: true,
        include: ['src/**/*.test.{ts,tsx}'],
    },
    server: {
        proxy: {
            '/api': {
                target: backend,
                changeOrigin: true, //支持跨域
                ws: true,
                // 重写路径,替换/api
                rewrite: (path) => path.replace(/^\/api/, ""),
            },
            '/share-link': {
                target: backend,
                changeOrigin: true,
            }
        },
        cors: true
    },
})
