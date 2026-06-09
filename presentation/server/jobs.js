import { DEFAULT_TTS_PROVIDER, DEFAULT_TTS_VOICE } from "./config.js";
import { readProject, saveProject } from "./projectStore.js";
import { synthesizeProjectAudio } from "./tts.js";
import { renderProjectVideo } from "./videoRenderer.js";

const running = new Map();

export function isJobRunning(projectId, kind) {
  return running.has(jobKey(projectId, kind));
}

export async function startSynthesisJob(projectId, options = {}) {
  const key = jobKey(projectId, "synthesize");
  if (running.has(key)) return readProject(projectId);

  const project = await markJobStarted(projectId, "synthesize", "synthesizing", {
    tts: {
      provider: options.provider || undefined,
      voice: options.voice || undefined,
    },
  });

  running.set(
    key,
    runJob(key, async () => {
      const current = await readProject(projectId);
      const audio = await synthesizeProjectAudio(current, {
        provider: current.tts?.provider,
        voice: current.tts?.voice,
        force: Boolean(options.force),
      });
      const latest = await readProject(projectId);
      latest.audio = audio.map(({ chapter, step, audio: file, status }) => ({
        chapter,
        step,
        audio: file,
        status,
      }));
      latest.status = latest.video?.file ? "complete" : "ready";
      latest.updatedAt = new Date().toISOString();
      latest.jobs = {
        ...latest.jobs,
        synthesize: successJob(audio.length),
      };
      await saveProject(latest);
    }),
  );

  return project;
}

export async function startRenderJob(projectId, options = {}) {
  const key = jobKey(projectId, "render");
  if (running.has(key)) return readProject(projectId);

  const project = await markJobStarted(projectId, "render", "rendering");

  running.set(
    key,
    runJob(key, async () => {
      if (options.synthesizeFirst) {
        let current = await readProject(projectId);
        current.status = "synthesizing";
        current.jobs = {
          ...current.jobs,
          synthesize: runningJob(),
          render: {
            ...current.jobs?.render,
            status: "waiting-for-audio",
          },
        };
        await saveProject(current);

        const audio = await synthesizeProjectAudio(current, {
          provider: current.tts?.provider,
          voice: current.tts?.voice,
          force: Boolean(options.forceAudio),
        });
        current = await readProject(projectId);
        current.audio = audio.map(({ chapter, step, audio: file, status }) => ({
          chapter,
          step,
          audio: file,
          status,
        }));
        current.status = "rendering";
        current.updatedAt = new Date().toISOString();
        current.jobs = {
          ...current.jobs,
          synthesize: successJob(audio.length),
          render: runningJob(),
        };
        await saveProject(current);
      }

      const current = await readProject(projectId);
      const video = await renderProjectVideo(current);
      const latest = await readProject(projectId);
      latest.video = video;
      latest.status = "complete";
      latest.updatedAt = new Date().toISOString();
      latest.jobs = {
        ...latest.jobs,
        render: {
          ...successJob(video.frames || 0),
          durationMs: video.durationMs,
        },
      };
      await saveProject(latest);
    }),
  );

  return project;
}

async function markJobStarted(projectId, kind, status, patch = {}) {
  const project = await readProject(projectId);
  project.status = status;
  project.updatedAt = new Date().toISOString();
  if (patch.tts) {
    project.tts = {
      provider:
        patch.tts.provider || project.tts?.provider || DEFAULT_TTS_PROVIDER,
      voice: patch.tts.voice || project.tts?.voice || DEFAULT_TTS_VOICE,
    };
  }
  project.jobs = {
    ...project.jobs,
    [kind]: runningJob(),
  };
  await saveProject(project);
  return project;
}

function runningJob() {
  return {
    status: "running",
    startedAt: new Date().toISOString(),
    finishedAt: null,
    error: null,
  };
}

function successJob(count) {
  return {
    status: "success",
    startedAt: null,
    finishedAt: new Date().toISOString(),
    error: null,
    count,
  };
}

function failedJob(error) {
  return {
    status: "failed",
    startedAt: null,
    finishedAt: new Date().toISOString(),
    error: error instanceof Error ? error.message : String(error),
  };
}

async function runJob(key, worker) {
  try {
    await worker();
  } catch (error) {
    const [projectId, kind] = key.split(":");
    const project = await readProject(projectId).catch(() => null);
    if (project) {
      project.status = "failed";
      project.updatedAt = new Date().toISOString();
      project.jobs = {
        ...project.jobs,
        [kind]: failedJob(error),
      };
      await saveProject(project).catch(() => {});
    }
    console.error(error);
  } finally {
    running.delete(key);
  }
}

function jobKey(projectId, kind) {
  return `${projectId}:${kind}`;
}
