import fs from "node:fs/promises";
import crypto from "node:crypto";
import {
  ensureStorage,
  projectAudioDir,
  projectDir,
  projectJsonPath,
  projectRenderDir,
} from "./config.js";
import { assertProjectId, conflict, notFound } from "./errors.js";

export function newProjectId() {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  return `${stamp}-${crypto.randomBytes(3).toString("hex")}`;
}

export async function saveProject(project) {
  assertProjectId(project.id);
  ensureStorage();
  await fs.mkdir(projectDir(project.id), { recursive: true });
  await fs.mkdir(projectAudioDir(project.id), { recursive: true });
  await fs.mkdir(projectRenderDir(project.id), { recursive: true });
  await fs.writeFile(projectJsonPath(project.id), JSON.stringify(project, null, 2));
  return project;
}

export async function readProject(id) {
  const projectId = assertProjectId(id);
  try {
    const raw = await fs.readFile(projectJsonPath(projectId), "utf8");
    return JSON.parse(raw);
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw notFound(`Project not found: ${projectId}`);
    }
    throw error;
  }
}

export async function updateProjectDraft(id, draft) {
  const projectId = assertProjectId(id);
  const project = await readProject(projectId);
  if (project.status === "synthesizing" || project.status === "rendering") {
    throw conflict("Project is busy. Wait for the current job to finish before editing.");
  }

  const chapters = normalizeChapters(draft.chapters);
  project.title = clean(draft.title) || project.title;
  project.content = chapters
    .flatMap((chapter) => chapter.steps)
    .join("\n---\n");
  project.chapters = chapters;
  project.segments = buildSegments(chapters);
  project.status = "draft";
  project.updatedAt = new Date().toISOString();
  project.revision = (project.revision || 0) + 1;
  project.jobs = {};
  delete project.audio;
  delete project.video;

  await fs.rm(projectAudioDir(projectId), { recursive: true, force: true });
  await fs.rm(projectRenderDir(projectId), { recursive: true, force: true });
  return saveProject(project);
}

export async function deleteProject(id) {
  const projectId = assertProjectId(id);
  await readProject(projectId);
  await fs.rm(projectDir(projectId), { recursive: true, force: true });
  return { id: projectId, deleted: true };
}

export async function listProjects() {
  ensureStorage();
  const dirs = await fs.readdir(projectDirRoot(), { withFileTypes: true }).catch(() => []);
  const projects = [];
  for (const entry of dirs) {
    if (!entry.isDirectory()) continue;
    try {
      const project = await readProject(entry.name);
      projects.push({
        id: project.id,
        title: project.title,
        createdAt: project.createdAt,
        status: project.status,
        provider: project.tts?.provider,
        segmentCount: project.segments?.length || 0,
        hasAudio: Boolean(project.audio?.length),
        hasVideo: Boolean(project.video?.file),
      });
    } catch {
      // Ignore broken project folders; they can be repaired or deleted later.
    }
  }
  return projects.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

function projectDirRoot() {
  return new URL("../storage/projects", import.meta.url);
}

function normalizeChapters(chapters) {
  if (!Array.isArray(chapters)) {
    throw new Error("chapters must be an array.");
  }

  const normalized = chapters
    .map((chapter, index) => {
      const id = normalizeId(chapter?.id, index);
      const title = clean(chapter?.title) || `第 ${index + 1} 章`;
      const steps = Array.isArray(chapter?.steps)
        ? chapter.steps.map(clean).filter(Boolean)
        : [];
      return { id, title, steps };
    })
    .filter((chapter) => chapter.steps.length > 0);

  if (normalized.length === 0) {
    throw new Error("At least one chapter with one non-empty step is required.");
  }
  return normalized;
}

function buildSegments(chapters) {
  return chapters.flatMap((chapter) =>
    chapter.steps.map((text, index) => ({
      chapter: chapter.id,
      step: index + 1,
      text,
      audio: `${chapter.id}/${index + 1}.mp3`,
    })),
  );
}

function normalizeId(value, index) {
  const id = clean(value)
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return id || `chapter-${index + 1}`;
}

function clean(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}
