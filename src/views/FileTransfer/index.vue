<script setup lang="ts">
defineOptions({
  name: "FileTransfer"
});
import { useFileTransfer } from "./index";
import { formatSize } from "@/utils/file";

const {
  uploadState,
  files,
  totalSize,
  totalSizePercent,
  onSelectedFiles,
  onRemoveFile,
  onRemove,
  onClear,
  onUploader
} = useFileTransfer();
</script>

<template>
  <div class="card">
    <!-- FileUpload 组件主体 -->
    <FileUpload
      ref="fileUpload"
      name="files"
      customUpload
      :auto="false"
      :multiple="true"
      :maxFileSize="uploadState.maxFileSize"
      chooseLabel="选择文件"
      uploadLabel="发送"
      cancelLabel="取消"
      @select="onSelectedFiles"
      @uploader="onUploader"
      :invalidFileLimitMessage="uploadState.invalidFileLimitMessage"
      :invalidFileSizeMessage="uploadState.invalidFileSizeMessage"
      :invalidFileTypeMessage="uploadState.invalidFileTypeMessage"
    >
      <template
        #header="{ chooseCallback, uploadCallback, clearCallback, files }"
      >
        <div class="flex flex-wrap justify-between items-center flex-1 gap-4">
          <div class="flex gap-2">
            <Button
              @click="chooseCallback()"
              label="选择文件"
              :disabled="uploadState.isUploading"
              icon="pi pi-plus"
              rounded
              outlined
              severity="secondary"
            ></Button>
            <Button
              @click="uploadCallback"
              label="发送"
              icon="pi pi-upload"
              rounded
              outlined
              severity="success"
              :disabled="uploadState.isUploading"
            ></Button>
            <Button
              @click="onClear(clearCallback)"
              label="取消"
              icon="pi pi-times"
              rounded
              outlined
              severity="danger"
              :disabled="!files || files.length === 0"
            ></Button>
          </div>
          <ProgressBar
            :value="totalSizePercent"
            :showValue="true"
            class="md:w-20rem h-2 w-full md:ml-auto"
          >
            <span class="whitespace-nowrap">{{ totalSize }}B / 1Mb</span>
          </ProgressBar>
        </div>
      </template>
      <!-- 自定义内容：待上传文件列表 -->
      <template #content="{ files, removeFileCallback }">
        <div v-if="files && files.length">
          <ul class="divide-y divide-gray-200">
            <li
              v-for="(file, index) in files"
              :key="file.name"
              class="flex justify-between items-center py-5"
            >
              <span>{{ file.name }}</span>
              <span class="text-gray-500 text-sm">
                {{ formatSize(file.size) }}
              </span>
              <span class="text-gray-500 text-sm"> {{ file.type }}</span>
              <button
                type="button"
                class="text-red-500 hover:text-red-700"
                @click="onRemoveFile(file, removeFileCallback, index)"
              >
                移除
              </button>
            </li>
          </ul>
        </div>
      </template>

      <!-- 自定义空状态：无文件时显示 -->
      <template #empty>
        <div class="flex flex-col items-center justify-center py-6">
          <p class="text-gray-500">拖拽文件到此，或点击“选择文件”</p>
        </div>
      </template>
    </FileUpload>
  </div>
</template>

<style lang="scss" scoped></style>
