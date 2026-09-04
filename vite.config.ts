import vue from "@vitejs/plugin-vue"
import vueJsx from "@vitejs/plugin-vue-jsx"
import { fileURLToPath, URL } from "node:url"
import AutoImport from "unplugin-auto-import/vite"
import { ElementPlusResolver } from "unplugin-vue-components/resolvers"
import Components from "unplugin-vue-components/vite"
import { defineConfig } from "vite"
// 引入cesium
import cesium from "vite-plugin-cesium"

import vueDevTools from "vite-plugin-vue-devtools"

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    vueJsx(),
    vueDevTools(),
    cesium(),
    AutoImport({
      imports: ["vue", "vue-router"],
      dirs: ["./src/type"],
      dts: "./src/auto-imports.d.ts",
      resolvers: [ElementPlusResolver()],
    }),
    Components({
      resolvers: [ElementPlusResolver()],
    }),
  ],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  /* 项目启动 */
  server: {
    port: 8081,
    host: "0.0.0.0",
    open: true,
    proxy: {
      "/check": {
        target: "http://172.160.114.20:7080",
        changeOrigin: true,
        rewrite: path => path.replace(/^\/ /, ""),
      },

      "/brBk": {
        target: "http://172.160.114.20:8091",
        changeOrigin: true,
      },

      "/api": {
        target: "https://br.yziic.com:19563",
        changeOrigin: true,
        secure: false,
        rewrite: path => path.replace(/^\/api/, ""),
      },

      "/cghall-ws": {
        target: "ws://10.10.51.1:559",
        ws: true,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/cghall-ws/, ""),
      },
      // 注意：/media 代理仅影响通过 Vite 转发的请求（C馆）
      // 非C馆请求直接浏览器直连 ws://172.160.x.x，不经过Vite，不受影响
      "/media": {
        target: "ws://10.10.51.1:559",
        ws: true,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "./dist", // 指定输出目录为 "./dist"
    assetsDir: "./assets", // 指定静态文件引入路径为 "./assets"
    sourcemap: false, // 不生成 sourceMap 文件
    minify: "esbuild", // 使用 terser 进行代码压缩
    emptyOutDir: true, // 在构建之前清空输出目录
    rollupOptions: {
      output: {
        // 在这里修改静态资源路径
        chunkFileNames: "assets/js/[name]-[hash].js",
        entryFileNames: "assets/js/[name]-[hash].js",
        assetFileNames: "assets/[ext]/[name]-[hash].[ext]",
      },
    },
  },

})
