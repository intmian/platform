import {defineConfig} from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
    plugins: [react()],
    server: {
        proxy: {
            '/api': {
                target: 'http://127.0.0.1:8080', // 内网部署环境 不使用node时无效 外网部署时用nginx将/api转发到后端，并且注意跨域
                changeOrigin: true, //支持跨域
                // 重写路径,替换/api
                rewrite: (path) => path.replace(/^\/api/, ""),
            }
        }
    }
})