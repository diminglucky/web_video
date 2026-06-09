export const STATUS_LABEL: Record<string, string> = {
  draft: "可预览草稿",
  ready: "已生成网页",
  synthesizing: "合成音频中",
  rendering: "导出 MP4 中",
  complete: "已完成",
  failed: "失败",
};

export function statusText(status = "ready") {
  return STATUS_LABEL[status] || status;
}
