import type { GeneratedProject } from "../generated/types";
import type { Health, ProjectListItem, Provider } from "./types";

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(path, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || data.message || "请求失败");
  }
  return data as T;
}

export function fetchHealth() {
  return request<Health>("/api/health");
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
  draft: Pick<GeneratedProject, "title" | "chapters">,
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
  forceAudio?: boolean;
}) {
  return request<GeneratedProject>(`/api/projects/${id}/render`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}
