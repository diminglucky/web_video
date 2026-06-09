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
      await updateJob(projectId, "synthesize", {
        stage: "synthesizing-audio",
        message: "Synthesizing narration audio.",
        progress: progress(0, current.segments?.length || 0),
      });
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
        synthesize: successJob(latest.jobs?.synthesize, audio.length, {
          stage: "audio-ready",
          message: "Audio synthesis complete.",
        }),
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
          synthesize: runningJob({
            stage: "synthesizing-audio",
            message: "Synthesizing audio before render.",
            progress: progress(0, current.segments?.length || 0),
          }),
          render: {
            ...runningJob({
              stage: "waiting-for-audio",
              message: "Waiting for audio synthesis.",
              progress: progress(0, current.segments?.length || 0),
            }),
            ...pickStartedAt(current.jobs?.render),
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
          synthesize: successJob(current.jobs?.synthesize, audio.length, {
            stage: "audio-ready",
            message: "Audio synthesis complete.",
          }),
          render: {
            ...current.jobs?.render,
            status: "running",
            stage: "rendering-video",
            message: "Capturing frames and building MP4.",
            progress: progress(0, current.segments?.length || 0),
          },
        };
        await saveProject(current);
      }

      const current = await readProject(projectId);
      await updateJob(projectId, "render", {
        stage: "rendering-video",
        message: "Capturing frames and building MP4.",
        progress: progress(0, current.segments?.length || 0),
      });
      const video = await renderProjectVideo(current);
      const latest = await readProject(projectId);
      latest.video = video;
      latest.status = "complete";
      latest.updatedAt = new Date().toISOString();
      latest.jobs = {
        ...latest.jobs,
        render: {
          ...successJob(latest.jobs?.render, video.frames || 0, {
            stage: "video-ready",
            message: "MP4 export complete.",
          }),
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
    [kind]: runningJob({
      stage: kind === "render" ? "queued-render" : "queued-synthesis",
      message: kind === "render" ? "Render job queued." : "Audio synthesis queued.",
      progress: progress(0, project.segments?.length || 0),
    }),
  };
  await saveProject(project);
  return project;
}

async function updateJob(projectId, kind, patch) {
  const project = await readProject(projectId);
  project.updatedAt = new Date().toISOString();
  project.jobs = {
    ...project.jobs,
    [kind]: {
      ...project.jobs?.[kind],
      ...patch,
    },
  };
  await saveProject(project);
  return project;
}

function runningJob(patch = {}) {
  return {
    status: "running",
    startedAt: new Date().toISOString(),
    finishedAt: null,
    error: null,
    stage: "running",
    message: "Job is running.",
    progress: progress(0, 0),
    ...patch,
  };
}

function successJob(previous, count, patch = {}) {
  return {
    status: "success",
    startedAt: previous?.startedAt || new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    error: null,
    count,
    progress: progress(count, count),
    ...patch,
  };
}

function failedJob(previous, error) {
  return {
    status: "failed",
    startedAt: previous?.startedAt || null,
    finishedAt: new Date().toISOString(),
    error: error instanceof Error ? error.message : String(error),
    stage: previous?.stage || "failed",
    message: "Job failed.",
    progress: previous?.progress || progress(0, 0),
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
        [kind]: failedJob(project.jobs?.[kind], error),
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

function progress(current, total) {
  return {
    current,
    total,
    percent: total > 0 ? Math.round((current / total) * 100) : 0,
  };
}

function pickStartedAt(job) {
  return job?.startedAt ? { startedAt: job.startedAt } : {};
}
