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
import { sanitizeGeneratedProject, sanitizeGeneratedText } from "./textSanitizer.js";
import { attachVisualPlans } from "./visualPlanner.js";

export function newProjectId() {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  return `${stamp}-${crypto.randomBytes(3).toString("hex")}`;
}

export async function saveProject(project) {
  assertProjectId(project.id);
  const nextProject = sanitizeGeneratedProject(
    attachVisualPlans(hydrateWorkflow(hydrateChapterNarrations(project))),
  );
  ensureStorage();
  await fs.mkdir(projectDir(nextProject.id), { recursive: true });
  await fs.mkdir(projectAudioDir(nextProject.id), { recursive: true });
  await fs.mkdir(projectRenderDir(nextProject.id), { recursive: true });
  await fs.writeFile(projectJsonPath(nextProject.id), JSON.stringify(nextProject, null, 2));
  return nextProject;
}

export async function readProject(id) {
  const projectId = assertProjectId(id);
  try {
    const raw = await fs.readFile(projectJsonPath(projectId), "utf8");
    return sanitizeGeneratedProject(
      attachVisualPlans(hydrateChapterNarrations(JSON.parse(stripBom(raw)))),
    );
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
    .flatMap((chapter) =>
      chapter.steps.map((step, index) => chapter.narrations[index] || step),
    )
    .join("\n---\n");
  project.chapters = chapters;
  project.segments = buildSegments(chapters, project.segments);
  project.status = "draft";
  project.updatedAt = new Date().toISOString();
  project.revision = (project.revision || 0) + 1;
  project.jobs = {};
  project.workflow = normalizeWorkflow(draft.workflow, project.workflow);
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

function stripBom(value) {
  return String(value || "").replace(/^\uFEFF/u, "");
}

function normalizeChapters(chapters) {
  if (!Array.isArray(chapters)) {
    throw new Error("chapters must be an array.");
  }

  const usedIds = new Set();
  const normalized = chapters
    .map((chapter, index) => {
      const id = uniqueId(normalizeId(chapter?.id, index), usedIds);
      const title = clean(chapter?.title) || `第 ${index + 1} 章`;
      const pairs = normalizeStepPairs(chapter);
      const steps = pairs.map((pair) => pair.step);
      const narrations = pairs.map((pair) => pair.narration);
      return { id, title, steps, narrations };
    })
    .filter((chapter) => chapter.steps.length > 0);

  if (normalized.length === 0) {
    throw new Error("At least one chapter with one non-empty step is required.");
  }
  return normalized;
}

function buildSegments(chapters, previousSegments = []) {
  const previousNarration = new Map(
    previousSegments.map((segment) => [
      `${segment.chapter}:${segment.step}`,
      sanitizeGeneratedText(segment.narration),
    ]),
  );
  return chapters.flatMap((chapter) =>
    chapter.steps.map((text, index) => ({
      chapter: chapter.id,
      step: index + 1,
      text,
      narration:
        sanitizeGeneratedText(chapter.narrations?.[index]) ||
        previousNarration.get(`${chapter.id}:${index + 1}`) ||
        text,
      audio: `${chapter.id}/${index + 1}.mp3`,
    })),
  );
}

function hydrateChapterNarrations(project) {
  if (!project || !Array.isArray(project.chapters)) return project;
  const screenByStep = new Map();
  for (const chapter of project.chapters) {
    if (!Array.isArray(chapter.steps)) continue;
    chapter.steps.forEach((step, index) => {
      screenByStep.set(`${chapter.id}:${index + 1}`, sanitizeGeneratedText(step));
    });
  }
  const narrationByStep = new Map(
    (Array.isArray(project.segments) ? project.segments : []).map((segment) => [
      `${segment.chapter}:${segment.step}`,
      sanitizeGeneratedText(segment.narration || segment.text),
    ]),
  );
  const hydratedChapters = project.chapters.map((chapter) => ({
    ...chapter,
    narrations: (Array.isArray(chapter.steps) ? chapter.steps : []).map(
      (step, index) =>
        sanitizeGeneratedText(chapter.narrations?.[index]) ||
        narrationByStep.get(`${chapter.id}:${index + 1}`) ||
        sanitizeGeneratedText(step),
    ),
  }));
  const hydratedNarrationByStep = new Map();
  for (const chapter of hydratedChapters) {
    chapter.narrations.forEach((narration, index) => {
      hydratedNarrationByStep.set(`${chapter.id}:${index + 1}`, narration);
    });
  }
  return {
    ...project,
    chapters: hydratedChapters,
    segments: Array.isArray(project.segments)
      ? project.segments.map((segment) => {
          const key = `${segment.chapter}:${segment.step}`;
          const text = sanitizeGeneratedText(segment.text) || screenByStep.get(key) || "";
          return {
            ...segment,
            text,
            narration:
              sanitizeGeneratedText(segment.narration) ||
              hydratedNarrationByStep.get(key) ||
              text,
          };
        })
      : project.segments,
  };
}

function hydrateWorkflow(project) {
  return {
    ...project,
    workflow: normalizeWorkflow(project?.workflow),
  };
}

function normalizeWorkflow(input, previous = {}) {
  if (input === undefined) {
    return {
      scriptApproved: Boolean(previous?.scriptApproved),
      storyboardApproved:
        Boolean(previous?.storyboardApproved) && Boolean(previous?.scriptApproved),
      scriptApprovedAt: clean(previous?.scriptApprovedAt) || undefined,
      storyboardApprovedAt:
        Boolean(previous?.storyboardApproved) && Boolean(previous?.scriptApproved)
          ? clean(previous?.storyboardApprovedAt) || undefined
          : undefined,
    };
  }
  const now = new Date().toISOString();
  const scriptApproved = Boolean(input?.scriptApproved);
  const storyboardApproved = Boolean(input?.storyboardApproved) && scriptApproved;
  return {
    scriptApproved,
    storyboardApproved,
    scriptApprovedAt: scriptApproved
      ? clean(input?.scriptApprovedAt) || clean(previous?.scriptApprovedAt) || now
      : undefined,
    storyboardApprovedAt: storyboardApproved
      ? clean(input?.storyboardApprovedAt) || clean(previous?.storyboardApprovedAt) || now
      : undefined,
  };
}

function normalizeStepPairs(chapter) {
  const rawSteps = Array.isArray(chapter?.steps) ? chapter.steps : [];
  const rawNarrations = Array.isArray(chapter?.narrations) ? chapter.narrations : [];
  return rawSteps
    .map((step, index) => {
      const cleanStep = clean(step);
      if (!cleanStep) return null;
      return {
        step: cleanStep,
        narration: sanitizeGeneratedText(rawNarrations[index]) || cleanStep,
      };
    })
    .filter(Boolean);
}

function normalizeId(value, index) {
  const id = clean(value)
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return id || `chapter-${index + 1}`;
}

function uniqueId(id, usedIds) {
  let next = id;
  let suffix = 2;
  while (usedIds.has(next)) {
    next = `${id}-${suffix}`;
    suffix += 1;
  }
  usedIds.add(next);
  return next;
}

function clean(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}
