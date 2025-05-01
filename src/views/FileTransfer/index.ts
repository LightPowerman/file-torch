import { reactive, ref, watch } from "vue";
import { useToast } from "primevue/usetoast";
import type {
  FileUploadRemoveEvent,
  FileUploadSelectEvent,
  FileUploadUploaderEvent
} from "primevue";
import { formatSize } from "@/utils/file";

export function useFileTransfer() {
  const toast = useToast();

  const uploadState = reactive({
    accept: "*",
    // 文件最大大小 4GB
    maxFileSize: 4 * 1024 * 1024 * 1024,
    invalidFileSizeMessage: "文件大小超过限制！",
    invalidFileTypeMessage: "文件类型不支持！",
    invalidFileLimitMessage: "文件数量超过限制！",
    isUploading: false
  });

  const files = ref([]);
  const totalSize = ref(0);
  const totalSizePercent = ref(0);

  /**
   * @param event FileUploadSelectEvent
   * @description 选择文件后触发的事件
   */
  const onSelectedFiles = (event: FileUploadSelectEvent) => {
    files.value = event.files;
    files.value.forEach((file: File) => {
      totalSize.value += file.size;
      console.log("File size:", file);
    });
  };

  /** 手动移除上传文件 */
  const onRemoveFile = (
    file: File,
    removeFileCallback: Function,
    index: number
  ) => {
    console.log("Remove file:", file);
    console.log("Remove file index:", index);
    removeFileCallback(index);
    totalSize.value -= parseInt(formatSize(file.size));
    totalSizePercent.value = totalSize.value / 10;
  };

  /**
   * @remove事件
   */
  const onRemove = (event: FileUploadRemoveEvent) => {
    console.log("Remove event file:", event.file);
    console.log("Remove event files:", event.files);
  };

  const onClear = (clear: Function) => {
    console.log("onClear event files");
    clear();
    totalSize.value = 0;
    totalSizePercent.value = 0;
  };

  /**
   * @param event FileUploadUploaderEvent
   * @description 自定义文件上传逻辑：webrtc
   */
  const onUploader = (event: FileUploadUploaderEvent) => {
    console.log("Uploader event:", event.files);
    uploadState.isUploading = true;
    
    // 导入 WebRTC 相关功能
    import('@/utils/rtc').then(({ createSenderDataChannel, sendFile, connectionId, transferProgress, isTransferComplete, connectionState }) => {
      // 创建数据通道
      createSenderDataChannel();
      
      // 监听连接状态变化
      const unwatch1 = watch(connectionState, (newState) => {
        if (newState === 'connected') {
          // 连接成功后，开始发送文件
          if (event.files && event.files.length > 0) {
            const file = event.files[0];
            const sendResult = sendFile(file);
            
            if (!sendResult) {
              toast.add({
                severity: "error",
                summary: "错误",
                detail: "文件发送失败，请重试",
                life: 3000
              });
              uploadState.isUploading = false;
              unwatch1();
              unwatch2();
            }
          }
        } else if (newState === 'failed' || newState === 'disconnected') {
          toast.add({
            severity: "error",
            summary: "连接失败",
            detail: "WebRTC连接失败，请检查网络后重试",
            life: 3000
          });
          uploadState.isUploading = false;
          unwatch1();
          unwatch2();
        }
      });
      
      // 监听传输进度
      const unwatch2 = watch([transferProgress, isTransferComplete], ([progress, completed]) => {
        totalSizePercent.value = progress;
        
        if (completed) {
          toast.add({
            severity: "success",
            summary: "传输完成",
            detail: `文件已成功发送，取件码：${connectionId.value}`,
            life: 5000
          });
          uploadState.isUploading = false;
          unwatch1();
          unwatch2();
        }
      });
    }).catch(error => {
      console.error('加载WebRTC模块失败:', error);
      toast.add({
        severity: "error",
        summary: "模块加载失败",
        detail: "无法加载WebRTC模块，请刷新页面重试",
        life: 3000
      });
      uploadState.isUploading = false;
    });
  };

  return {
    uploadState,
    files,
    totalSize,
    totalSizePercent,
    onSelectedFiles,
    onRemoveFile,
    onRemove,
    onClear,
    onUploader
  };
}
