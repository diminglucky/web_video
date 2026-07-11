import type { GeneratedProject } from "../generated/types";
import type {
  Health,
  LocalTtsTestResult,
  LlmModelTestResult,
  ProjectListItem,
  Provider,
  SaveSettingsInput,
  StudioSettings,
  TtsTestResult,
} from "./types";

const API_BASE_URL = import.meta.env.VITE_WEB_VIDEO_API_BASE_URL || "";

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(toApiUrl(path), options);
  } catch (error) {
    throw new Error(formatNetworkError(error), { cause: error });
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    if (data && typeof data === "object") {
      const message =
        "error" in data
          ? data.error
          : "message" in data
            ? data.message
            : "";
      if (message) throw new Error(String(message));
    }
    throw new Error(`请求失败：HTTP ${res.status}`);
  }
  return (data || {}) as T;
}

function formatNetworkError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const target = API_BASE_URL || "当前页面同源 /api";
  return `无法连接后端服务 ${target}。请确认前后端已启动，或刷新页面后重试。原始错误：${message}`;
}

function toApiUrl(path: string) {
  if (/^https?:\/\//u.test(path)) return path;
  return `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

export function fetchHealth() {
  return request<Health>("/api/health");
}

export function fetchSettings() {
  return request<StudioSettings>("/api/settings");
}

export function saveSettings(input: SaveSettingsInput) {
  return request<StudioSettings>("/api/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export function testLlmSettings(input: {
  apiKey: string;
  baseUrl: string;
  timeoutMs: string;
}) {
  return request<LlmModelTestResult>("/api/settings/llm/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export function testTtsSettings(input: {
  apiKey: string;
  baseUrl: string;
  model: string;
  voice: string;
}) {
  return request<TtsTestResult>("/api/settings/tts/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export function testLocalTtsSettings(input: {
  provider: Provider;
  voice: string;
  rate: string;
  volume: string;
  format: string;
}) {
  return request<LocalTtsTestResult>("/api/settings/tts/local-test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function fetchProjects() {
  const data = await request<{ projects: ProjectListItem[] }>("/api/projects");
  return data.projects || [];
}

export function fetchProject(id: string) {
  return request<GeneratedProject>(`/api/projects/${id}`);
}

export function createProject(input: {
  title: string;
  content: string;
  ttsProvider: Provider;
  voice: string;
  ttsRate: string;
  ttsVolume: string;
  ttsFormat: string;
}) {
  return request<GeneratedProject>("/api/projects", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...input,
      synthesize: false,
      render: false,
    }),
  });
}

export function saveProjectDraft(
  id: string,
  draft: Pick<GeneratedProject, "title" | "chapters"> & {
    workflow?: GeneratedProject["workflow"];
  },
) {
  return request<GeneratedProject>(`/api/projects/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(draft),
  });
}

export function deleteProject(id: string) {
  return request<{ id: string; deleted: boolean }>(`/api/projects/${id}`, {
    method: "DELETE",
  });
}

export function synthesizeProject(id: string, input: {
  ttsProvider: Provider;
  voice: string;
  ttsRate: string;
  ttsVolume: string;
  ttsFormat: string;
  force?: boolean;
}) {
  return request<GeneratedProject>(`/api/projects/${id}/synthesize`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export function renderProject(id: string, input: {
  synthesizeFirst: boolean;
  ttsProvider: Provider;
  voice: string;
  ttsRate: string;
  ttsVolume: string;
  ttsFormat: string;
  forceAudio?: boolean;
}) {
  return request<GeneratedProject>(`/api/projects/${id}/render`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}
