import { createRouter, createWebHistory } from "vue-router";
import Home from "@/views/Home/index.vue";

// 创建路由实例
const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: "/",
      redirect: "/file-transfer"
    },
    {
      path: "/file-transfer",
      name: "FileTransfer",
      component: Home, // 使用Home作为容器组件
      meta: { activeTab: 0 }
    },
    {
      path: "/text-chat",
      name: "TextChat",
      component: Home,
      meta: { activeTab: 1 }
    },
    {
      path: "/screen-share",
      name: "ScreenShare",
      component: Home,
      meta: { activeTab: 2 }
    },
    {
      path: "/av-call",
      name: "AVCall",
      component: Home,
      meta: { activeTab: 3 }
    }
  ]
});

export default router;
