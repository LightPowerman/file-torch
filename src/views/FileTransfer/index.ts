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
  const onUploader = async (event: FileUploadUploaderEvent) => {
    console.log("Uploader event:", event.files);
    uploadState.isUploading = true;
    const files = event.files;
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
