import { createRouter, createWebHistory } from "vue-router"

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: "/",
      redirect: "/MainHome",
    },
    {
      path: "/login",
      name: "login",
      component: () => import("@/views/login/index.vue"),
    },
    {
      path: "/MainHome",
      name: "MainHome",
      component: () => import("@/page/index.vue"),
    },
    {
      path: "/:pathMatch(.*)*", // 匹配所有未定义的路径
      name: "NotFound",
      component: () => import("@/views/error/NotFound.vue"), // 使用懒加载加载 NotFound 页面
    },
  ],
})

// router.beforeEach((to, from, next) => {
//   const token = sessionStorage.getItem("auth_token");

//   if (!token && to.path !== "/login") {
//     next({ path: "/login" });
//   } else {
//     next();
//   }
// });

export default router








