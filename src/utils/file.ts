import { usePrimeVue } from "primevue/config";

/**
 * 将文件大小（字节）格式化为人类可读的字符串，并附带适当的单位。
 *
 * @param bytes - 要格式化的字节大小
 * @returns 格式化后的字符串，包含大小和单位（例如："2.500 MB"）
 *
 * @example
 * // 返回 "1.000 KB"
 * formatSize(1024);
 *
 * @example
 * // 返回 "0 B"
 * formatSize(0);
 *
 * @remarks
 * 此函数使用PrimeVue的区域设置来获取单位名称（如果可用），
 * 否则回退到默认单位 ["B", "KB", "MB", "GB"]。
 * 结果四舍五入到小数点后3位。
 */
export const formatSize = (bytes: number) => {
  const $primevue = usePrimeVue();
  const k = 1024;
  const dm = 3;
  const sizes = $primevue.config.locale?.fileSizeTypes ?? [
    "B",
    "KB",
    "MB",
    "GB"
  ];

  if (bytes === 0) {
    return `0 ${sizes[0]}`;
  }

  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const formattedSize = parseFloat((bytes / Math.pow(k, i)).toFixed(dm));

  return `${formattedSize} ${sizes[i]}`;
};

