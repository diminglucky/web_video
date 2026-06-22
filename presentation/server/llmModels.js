import { failedDependency } from "./errors.js";

const DEFAULT_BASE_URL = "https://api.openai.com/v1";

export async function listLlmModels(input = {}) {
  const apiKey = String(input.apiKey || process.env.OPENAI_API_KEY || "").trim();
  const baseUrl = normalizeBaseUrl(input.baseUrl || process.env.OPENAI_BASE_URL);
  const timeoutMs = Number(input.timeoutMs || process.env.WEB_VIDEO_LLM_TIMEOUT_MS || 20000);

  if (!apiKey) {
    throw failedDependency("请先填写 API Key，再测试大模型接口。");
  }

  const response = await fetchWithTimeout(`${baseUrl}/models`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
  }, timeoutMs);

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw failedDependency(`模型列表获取失败：${response.status} ${trimDetail(detail)}`);
  }

  const data = await response.json();
  const models = normalizeModels(data)
    .filter((model) => isLikelyTextModel(model.id))
    .sort((a, b) => a.id.localeCompare(b.id));

  if (models.length === 0) {
    throw failedDependency("接口可访问，但没有返回可用文本模型。");
  }

  return {
    ok: true,
    baseUrl,
    models,
  };
}

function normalizeModels(data) {
  const raw = Array.isArray(data?.data) ? data.data : [];
  return raw
    .map((item) => ({
      id: String(item?.id || "").trim(),
      ownedBy: String(item?.owned_by || item?.ownedBy || "").trim(),
    }))
    .filter((item) => item.id);
}

function isLikelyTextModel(id) {
  const value = id.toLowerCase();
  const blocked = [
    "embedding",
    "whisper",
    "tts",
    "audio",
    "moderation",
    "image",
    "vision-preview",
    "dall-e",
  ];
  return !blocked.some((part) => value.includes(part));
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw failedDependency(`模型列表请求超时：${timeoutMs}ms。`);
    }
    throw failedDependency(`无法连接大模型接口：${error.message}`);
  } finally {
    clearTimeout(timer);
  }
}

function normalizeBaseUrl(value) {
  return String(value || DEFAULT_BASE_URL).replace(/\/+$/u, "");
}

function trimDetail(value) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > 300 ? `${text.slice(0, 300)}...` : text;
}
