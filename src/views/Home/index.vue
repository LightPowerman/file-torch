<script setup lang="ts">
defineOptions({
  name: "Home"
});
import { ref, onMounted, watch, shallowRef } from "vue";
import { useRouter, useRoute } from "vue-router";
import { useToast } from "primevue/usetoast";
import FileTransfer from "@/views/FileTransfer/index.vue";
import TextChat from "@/views/TextChat/index.vue";
import ScreenShare from "@/views/ScreenShare/index.vue";
import AVCall from "@/views/AVCall/index.vue";

const toast = useToast();
const router = useRouter();
const route = useRoute();

const menuItems = shallowRef([
  {
    label: "文件传输",
    icon: "pi pi-file",
    component: FileTransfer,
    path: "/file-transfer"
  },
  {
    label: "文本聊天（传输）",
    icon: "pi pi-book",
    component: TextChat,
    path: "/text-chat"
  },
  {
    label: "屏幕共享",
    icon: "pi pi-desktop",
    component: ScreenShare,
    path: "/screen-share"
  },
  {
    label: "音/视频通话",
    icon: "pi pi-video",
    component: AVCall,
    path: "/av-call"
  }
]);

// 当前活动的tab索引
const activeTabIndex = ref(0);

onMounted(() => {
  // 在组件挂载时根据当前路由设置活动tab
  const currentPath = route.path;
  const index = menuItems.value.findIndex(item => item.path === currentPath);
  if (index !== -1) {
    activeTabIndex.value = index;
  } else {
    // 如果是根路径，默认导航到第一个tab
    if (currentPath === "/") {
      router.push(menuItems.value[0].path);
    }
  }
});

// 监听tab切换，同步更新路由
watch(activeTabIndex, newIndex => {
  router.push(menuItems.value[newIndex].path);
});

// 取件码
const pickUpCode = ref("");

// 接收文件
function receiveFileByCode() {
  if (!pickUpCode.value) {
    return toast.add({
      severity: "warn",
      summary: "提示",
      detail: "请输入取件码",
      life: 1000
    });
  }

  // 导入 WebRTC 相关功能测试
  import("@/utils/rtc")
    .then(
      ({
        validatePickupCode,
        initFileReceiver,
        connectionState,
        transferProgress,
        isTransferComplete
      }) => {
        // 验证取件码
        validatePickupCode(pickUpCode.value)
          .then(id => {
            // 初始化文件接收器
            initFileReceiver(id);

            toast.add({
              severity: "info",
              summary: "连接中",
              detail: "正在连接发送方，请稍候...",
              life: 2000
            });

            // 监听连接状态变化
            const unwatch1 = watch(connectionState, newState => {
              if (newState === "connected") {
                toast.add({
                  severity: "success",
                  summary: "已连接",
                  detail: "正在接收文件...",
                  life: 2000
                });
              } else if (newState === "failed" || newState === "disconnected") {
                toast.add({
                  severity: "error",
                  summary: "连接失败",
                  detail: "无法连接到发送方，请检查取件码是否正确",
                  life: 3000
                });
                unwatch1();
                unwatch2();
              }
            });

            // 监听传输进度
            const unwatch2 = watch(
              [transferProgress, isTransferComplete],
              ([progress, completed]) => {
                console.log(`文件接收进度: ${progress}%`);

                if (completed) {
                  toast.add({
                    severity: "success",
                    summary: "接收完成",
                    detail: "文件已成功接收并下载",
                    life: 3000
                  });
                  // 重置取件码
                  pickUpCode.value = "";
                  unwatch1();
                  unwatch2();
                }
              }
            );
          })
          .catch(error => {
            toast.add({
              severity: "error",
              summary: "错误",
              detail: error.message || "无效的取件码",
              life: 3000
            });
          });
      }
    )
    .catch(error => {
      console.error("加载WebRTC模块失败:", error);
      toast.add({
        severity: "error",
        summary: "模块加载失败",
        detail: "无法加载WebRTC模块，请刷新页面重试",
        life: 3000
      });
    });
}

// 处理菜单项点击
function handleMenuItemClick(index: number) {
  activeTabIndex.value = index;
}

// 调用相机扫码
function openCamera() {
  // 1、调用相机扫码
  // 2、扫码成功后，设置取件码
}
</script>

<template>
  <div class="main-container">
    <!-- 头部标题：描述项目用途 -->
    <Panel header="火炬传输，一个简单的在线文件传输工具" class="mb-3">
      <p class="bg-primary mb-3">
        火炬传输是一个简单的跨设备在线文件传输工具，旨在提供快速、安全和便捷的文件共享体验。无论是个人用户还是团队协作，火炬传输都能满足您的需求。
        通过简单的界面和高效的传输速度，您可以轻松地与他人分享文件，而无需担心复杂的设置或繁琐的操作。
      </p>
    </Panel>

    <Toolbar style="border-radius: 3rem; padding: 1rem 1rem 1rem 1.5rem">
      <template #start>
        <div class="flex items-center gap-2">
          <Image src="/src/assets/logo.png" alt="logo" width="32" height="32" />
          <Button
            v-for="(item, index) in menuItems"
            :key="index"
            :label="item.label"
            :icon="item.icon"
            :style="{
              color:
                activeTabIndex === index
                  ? 'var(--primary-color)'
                  : 'var(--text-color)'
            }"
            text
            plain
            @click="handleMenuItemClick(index)"
          />
        </div>
      </template>

      <template #end>
        <div class="flex items-center gap-2">
          <FloatLabel variant="on">
            <IconField>
              <InputIcon class="pi pi-qrcode qr-code" @click="openCamera" />
              <InputText id="on_label" v-model="pickUpCode" />
            </IconField>
            <label for="on_label" style="font-size: 14px">输入取件码</label>
          </FloatLabel>
          <Button
            label="接收"
            severity="warn"
            size="small"
            @click="receiveFileByCode"
          />
        </div>
      </template>
    </Toolbar>

    <Toast />

    <!-- 使用TabView实现内容切换 -->
    <div class="content-container mt-3">
      <component :is="menuItems[activeTabIndex].component" />
    </div>
  </div>
</template>

<style lang="scss" scoped>
.main-container {
  position: relative;
  padding: 20px;
  box-sizing: border-box;
}

.content-container {
  border-radius: 10px;
  border: 1px solid var(--border-color);
  padding: 20px;
  min-height: 400px;
  box-shadow: var(--card-shadow);
}

.qr-code {
  cursor: pointer;
  transition: all 0.3s ease-in-out;
  &:hover {
    transform: scale(1.2);
    color: var(--primary-color);
  }
}
</style>
