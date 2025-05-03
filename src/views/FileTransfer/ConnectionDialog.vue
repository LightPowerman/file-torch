<template>
  <Dialog
    v-model:visible="visible"
    modal
    header="建立连接"
    :closable="!isConnecting"
    :style="{ width: '450px' }"
    :closeOnEscape="false"
  >
    <div class="flex flex-column gap-4">
      <div v-if="connectionMode === 'sender'" class="text-center">
        <div v-if="isGeneratingOffer" class="flex flex-column align-items-center">
          <ProgressSpinner style="width: 50px; height: 50px" />
          <p>正在生成连接信息...</p>
        </div>
        <div v-else-if="offer" class="flex flex-column align-items-center gap-3">
          <div class="qrcode-container" ref="qrCodeContainer"></div>
          <small class="text-gray-500">扫描二维码或复制连接信息</small>
          <div class="p-inputgroup">
            <InputText v-model="offerString" readonly class="w-full" />
            <Button icon="pi pi-copy" @click="copyToClipboard(offerString)" />
          </div>
          <small class="text-gray-500">等待对方连接...</small>
        </div>
      </div>
      
      <div v-if="connectionMode === 'receiver'" class="flex flex-column gap-3">
        <div class="p-inputgroup">
          <InputText 
            v-model="inputConnectionInfo" 
            placeholder="粘贴连接信息或扫描二维码"
            :disabled="isConnecting" 
            class="w-full"
          />
          <Button 
            icon="pi pi-camera" 
            @click="startScanner" 
            :disabled="isConnecting || isScannerActive" 
          />
        </div>
        
        <div v-if="isScannerActive" class="scanner-container text-center">
          <div ref="scannerContainer"></div>
          <Button @click="stopScanner" label="取消扫描" class="mt-2" />
        </div>
        
        <Button 
          label="连接" 
          @click="connect" 
          :disabled="!inputConnectionInfo || isConnecting" 
          :loading="isConnecting"
          class="w-full" 
        />
      </div>
      
      <div v-if="connectionState === 'connected'" class="text-center text-green-500">
        <i class="pi pi-check-circle text-3xl"></i>
        <p>连接成功！</p>
      </div>
      
      <div v-if="error" class="p-error text-center">
        <i class="pi pi-times-circle text-xl"></i>
        <p>{{ error }}</p>
      </div>
      
      <TabView v-model:activeIndex="activeTab" class="w-full">
        <TabPanel header="发送文件">
          <Button 
            label="作为发送方" 
            icon="pi pi-upload" 
            @click="setMode('sender')" 
            :disabled="isConnecting || connectionState === 'connected'"
            class="w-full" 
          />
        </TabPanel>
        <TabPanel header="接收文件">
          <Button 
            label="作为接收方" 
            icon="pi pi-download" 
            @click="setMode('receiver')" 
            :disabled="isConnecting || connectionState === 'connected'"
            class="w-full" 
          />
        </TabPanel>
      </TabView>
    </div>
    
    <template #footer>
      <Button 
        label="关闭" 
        icon="pi pi-times" 
        @click="close" 
        :disabled="isConnecting && connectionState !== 'connected'"
        class="p-button-text" 
      />
    </template>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch, computed } from 'vue';
import Dialog from 'primevue/dialog';
import Button from 'primevue/button';
import TabView from 'primevue/tabview';
import TabPanel from 'primevue/tabpanel';
import InputText from 'primevue/inputtext';
import ProgressSpinner from 'primevue/progressspinner';
import { useToast } from 'primevue/usetoast';
import { 
  initializeConnection, 
  createSenderChannel,
  listenForDataChannel,
  createOffer,
  createAnswer,
  setRemoteDescription,
  connectionState as rtcConnectionState
} from '@/utils/rtc';

const props = defineProps<{
  visible: boolean
}>();

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void;
  (e: 'connected'): void;
}>();

const toast = useToast();
const activeTab = ref(0);
const connectionMode = ref<'sender' | 'receiver' | null>(null);
const isGeneratingOffer = ref(false);
const isConnecting = ref(false);
const isScannerActive = ref(false);
const error = ref('');
const offer = ref<RTCSessionDescriptionInit | null>(null);
const offerString = ref('');
const inputConnectionInfo = ref('');
const qrCodeContainer = ref<HTMLElement | null>(null);
const scannerContainer = ref<HTMLElement | null>(null);
let qrCode: any = null;
let scanner: any = null;
let rtcControl: any = null;

// 使用计算属性来获取RTCConnectionState
const connectionState = computed(() => rtcConnectionState.value);

// 监听连接状态变化
watch(connectionState, (newState) => {
  if (newState === 'connected') {
    isConnecting.value = false;
    emit('connected');
    
    toast.add({
      severity: 'success',
      summary: '连接成功',
      detail: 'WebRTC连接已建立',
      life: 3000
    });
  }
});

// 设置连接模式
const setMode = async (mode: 'sender' | 'receiver') => {
  connectionMode.value = mode;
  error.value = '';
  
  if (mode === 'sender') {
    try {
      isGeneratingOffer.value = true;
      
      // 初始化WebRTC连接
      rtcControl = initializeConnection();
      
      // 创建数据通道
      createSenderChannel();
      
      // 创建提议
      const generatedOffer = await createOffer();
      offer.value = generatedOffer;
      
      // 将offer转换为字符串
      offerString.value = btoa(JSON.stringify(generatedOffer));
      
      // 生成二维码
      await loadQRCode();
      
      isGeneratingOffer.value = false;
    } catch (err) {
      console.error('生成连接信息失败:', err);
      error.value = '生成连接信息失败: ' + (err.message || err);
      isGeneratingOffer.value = false;
    }
  } else {
    // 初始化接收方连接
    rtcControl = initializeConnection();
    
    // 监听数据通道
    listenForDataChannel();
  }
};

// 加载QR码库并生成二维码
const loadQRCode = async () => {
  if (!qrCode && offerString.value) {
    try {
      const QRCode = (await import('qrcode')).default;
      
      if (qrCodeContainer.value) {
        await QRCode.toCanvas(qrCodeContainer.value, offerString.value, {
          width: 200,
          margin: 1,
          color: {
            dark: '#000000',
            light: '#ffffff'
          }
        });
        qrCode = QRCode;
      }
    } catch (err) {
      console.error('加载二维码库失败:', err);
    }
  }
};

// 复制到剪贴板
const copyToClipboard = (text: string) => {
  navigator.clipboard.writeText(text).then(() => {
    toast.add({
      severity: 'info',
      summary: '已复制',
      detail: '连接信息已复制到剪贴板',
      life: 2000
    });
  });
};

// 开始扫描二维码
const startScanner = async () => {
  try {
    const Html5QrcodeScanner = (await import('html5-qrcode')).Html5QrcodeScanner;
    
    isScannerActive.value = true;
    
    setTimeout(() => {
      if (scannerContainer.value) {
        scanner = new Html5QrcodeScanner(
          scannerContainer.value.id,
          { fps: 10, qrbox: { width: 250, height: 250 } },
          false
        );
        
        scanner.render((decodedText) => {
          inputConnectionInfo.value = decodedText;
          stopScanner();
        }, (err) => {
          // 忽略扫描错误
        });
      }
    }, 100);
  } catch (err) {
    console.error('加载扫描器失败:', err);
    isScannerActive.value = false;
    toast.add({
      severity: 'error',
      summary: '加载失败',
      detail: '无法加载二维码扫描器',
      life: 3000
    });
  }
};

// 停止扫描
const stopScanner = () => {
  if (scanner) {
    scanner.clear();
    scanner = null;
  }
  isScannerActive.value = false;
};

// 解析SDP字符串
const parseSdpString = (sdpString: string): RTCSessionDescriptionInit | null => {
  try {
    return JSON.parse(atob(sdpString));
  } catch (err) {
    error.value = '无效的连接信息';
    return null;
  }
};

// 连接到发送方
const connect = async () => {
  if (!inputConnectionInfo.value) return;
  
  error.value = '';
  isConnecting.value = true;
  
  try {
    // 解析接收到的offer
    const receivedOffer = parseSdpString(inputConnectionInfo.value);
    
    if (!receivedOffer) {
      isConnecting.value = false;
      return;
    }
    
    // 创建应答
    const answer = await createAnswer(receivedOffer);
    
    // 将answer编码为字符串显示给用户
    const answerString = btoa(JSON.stringify(answer));
    
    // 显示answer给用户复制
    toast.add({
      severity: 'info',
      summary: '请将此信息发送给对方',
      detail: '已生成连接响应，请将此信息发送给发送方',
      life: 10000
    });
    
    // 这里应该有一个UI来显示answer给用户
    // 简化版：我们直接复制到剪贴板
    copyToClipboard(answerString);
    
    // 实际应用中需要一个信令服务器或让用户手动传递answer到发送方
  } catch (err) {
    console.error('连接失败:', err);
    error.value = '连接失败: ' + (err.message || err);
    isConnecting.value = false;
  }
};

// 关闭对话框
const close = () => {
  if (isConnecting.value && connectionState.value !== 'connected') {
    // 如果正在连接中且未成功，提示用户
    toast.add({
      severity: 'warn',
      summary: '连接中',
      detail: '正在建立连接，请稍候再关闭',
      life: 3000
    });
    return;
  }
  
  emit('update:visible', false);
};

// 组件挂载时
onMounted(() => {
  if (scannerContainer.value) {
    scannerContainer.value.id = 'scanner-container-' + Date.now();
  }
});

// 组件卸载前
onBeforeUnmount(() => {
  stopScanner();
});
</script>

<style scoped>
.qrcode-container {
  min-height: 200px;
  display: flex;
  justify-content: center;
  align-items: center;
}

.scanner-container {
  min-height: 300px;
  margin: 1rem 0;
}
</style>
