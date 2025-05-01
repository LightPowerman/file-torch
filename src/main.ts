import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";
import PrimeVue from "primevue/config";
// 自定义组件引入
import { usePrimeVue } from "@/plugins/primeVue";
// 引入主题
import Aura from "@primeuix/themes/aura";
// 引入路由
import router from "@/router";

// 引入样式
import "@/style/index.scss";
import "@/style/tailwind.css";

const app = createApp(App);

app.use(createPinia());
app.use(router); // 使用路由
app.use(PrimeVue, {
  theme: {
    preset: Aura,
    option: {
      prefix: "p",
      darkModeSelector: false,
      cssLayer: false
    }
  }
});
usePrimeVue(app);

app.mount("#app");

// TODO：主题切换
