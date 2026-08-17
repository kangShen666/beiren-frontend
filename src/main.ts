// 引入dataV
import DataVVue3 from "@kjgl77/datav-vue3"
import { createApp } from "vue"

import App from "./App.vue"

import router from "./router"
import 'element-plus/dist/index.css'
// 导入pinia
import pinia from "./stores/index" // 引入封装好的 pinia 实例
// 导入rem
import "@/assets/js/rem.js"
// 默认的清楚的样式
import "modern-css-reset/dist/reset.min.css"

const app = createApp(App)

app.use(pinia)
app.use(router)
app.use(DataVVue3)
app.mount("#app")
