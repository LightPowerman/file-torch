// 按需引入PrimeVue组件
import type { App, Component } from "vue";
import {
  Button,
  Message,
  Toast,
  Menubar,
  Image,
  Avatar,
  Dialog,
  DynamicDialog,
  FileUpload,
  Panel,
  Toolbar,
  FloatLabel,
  InputText,
  IconField,
  InputIcon,
  Badge,
  ProgressBar,
  // Plugins
  ToastService
} from "primevue";

const components = [
  Button,
  Message,
  Toast,
  Menubar,
  Image,
  Avatar,
  Dialog,
  DynamicDialog,
  FileUpload,
  Panel,
  Toolbar,
  FloatLabel,
  InputText,
  IconField,
  InputIcon,
  Badge,
  ProgressBar
];

const plugins = [ToastService];

/** 按需引入`PrimeVue` */
export function usePrimeVue(app: App) {
  // 全局注册组件
  components.forEach((component: Component) => {
    if (component.name) {
      app.component(component.name, component);
    }
  });

  // 全局注册插件
  plugins.forEach((plugin: any) => {
    app.use(plugin);
  });
}
