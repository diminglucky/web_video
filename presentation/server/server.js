import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  CHROME_EXECUTABLE_PATH,
  DEFAULT_TTS_PROVIDER,
  DEFAULT_TTS_VOICE,
  PROJECTS_DIR,
  RENDER_BASE_URL,
  SERVER_PORT,
  ensureStorage,
} from "./config.js";
import { startRenderJob, startSynthesisJob } from "./jobs.js";
import { buildProjectWithGenerator } from "./llmScriptPlanner.js";
import { listLlmModels } from "./llmModels.js";
import { testLocalTtsSettings, testOpenAiSpeechSettings } from "./tts.js";
import { asyncHandler, sendError } from "./errors.js";
import { getRuntimeHealth } from "./runtimeChecks.js";
import { readSettings, saveSettings } from "./settings.js";
import { assertTeachingQuality } from "./qualityGate.js";
import {
  deleteProject,
  listProjects,
  newProjectId,
  readProject,
  saveProject,
  updateProjectDraft,
} from "./projectStore.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const app = express();

ensureStorage();

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (isAllowedLocalOrigin(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
  }
  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }
  next();
});

app.use(express.json({ limit: "1mb" }));
app.use("/storage/projects", express.static(PROJECTS_DIR));

app.get("/api/health", asyncHandler(async (_req, res) => {
  const runtime = await getRuntimeHealth();
  const settings = await readSettings();
  res.json({
    ok: true,
    version: "2026-06-20-local-runtime-v2",
    defaultProvider: DEFAULT_TTS_PROVIDER,
    defaultVoice: DEFAULT_TTS_VOICE,
    openaiConfigured: settings.secrets.OPENAI_API_KEY,
    chromeConfigured: runtime.chromeConfigured,
    ffmpegConfigured: runtime.ffmpegConfigured,
    ffprobeConfigured: runtime.ffprobeConfigured,
    ttsConfigured: runtime.ttsConfigured,
    renderBaseUrl: RENDER_BASE_URL,
    checks: runtime.checks,
  });
}));

app.get("/api/settings", asyncHandler(async (_req, res) => {
  res.json(await readSettings());
}));

app.put("/api/settings", asyncHandler(async (req, res) => {
  res.json(await saveSettings(req.body || {}));
}));

app.post("/api/settings/llm/test", asyncHandler(async (req, res) => {
  res.json(await listLlmModels({
    apiKey: req.body?.apiKey,
    baseUrl: req.body?.baseUrl,
    timeoutMs: req.body?.timeoutMs,
  }));
}));

app.post("/api/settings/tts/test", asyncHandler(async (req, res) => {
  res.json(await testOpenAiSpeechSettings({
    apiKey: req.body?.apiKey,
    baseUrl: req.body?.baseUrl,
    model: req.body?.model,
    voice: req.body?.voice,
  }));
}));

app.post("/api/settings/tts/local-test", asyncHandler(async (req, res) => {
  res.json(await testLocalTtsSettings({
    provider: req.body?.provider,
    voice: req.body?.voice,
    rate: req.body?.rate,
    volume: req.body?.volume,
    format: req.body?.format,
  }));
}));

app.get("/api/projects", asyncHandler(async (_req, res) => {
  res.json({ projects: await listProjects() });
}));

app.get("/api/projects/:id", asyncHandler(async (req, res) => {
  res.json(await readProject(req.params.id));
}));

app.post("/api/projects", asyncHandler(async (req, res) => {
    const {
      title,
      content,
      ttsProvider,
      voice,
      ttsRate,
      ttsVolume,
      ttsFormat,
      synthesize = false,
      render = false,
    } = req.body || {};
    const base = await buildProjectWithGenerator({ title, content });
    const quality = assertTeachingQuality(base);
    base.generation = {
      ...base.generation,
      quality: quality.metrics,
    };
    const id = newProjectId();
    const project = {
      ...base,
      id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      tts: {
        provider: ttsProvider || DEFAULT_TTS_PROVIDER,
        voice: voice || DEFAULT_TTS_VOICE,
        rate: ttsRate || process.env.WEB_VIDEO_TTS_RATE || "0",
        volume: ttsVolume || process.env.WEB_VIDEO_TTS_VOLUME || "100",
        format: ttsFormat || process.env.WEB_VIDEO_TTS_FORMAT || "mp3",
      },
      status: "draft",
      jobs: {},
    };
    await saveProject(project);

    if (render) {
      await startRenderJob(id, { synthesizeFirst: true });
    } else if (synthesize) {
      await startSynthesisJob(id, {
        provider: project.tts.provider,
        voice: project.tts.voice,
        rate: project.tts.rate,
        volume: project.tts.volume,
        format: project.tts.format,
      });
    }

    res.status(201).json(await readProject(id));
}));

app.put("/api/projects/:id", asyncHandler(async (req, res) => {
    res.json(
      await updateProjectDraft(req.params.id, {
        title: req.body?.title,
        chapters: req.body?.chapters,
        workflow: req.body?.workflow,
      }),
    );
}));

app.delete("/api/projects/:id", asyncHandler(async (req, res) => {
  res.json(await deleteProject(req.params.id));
}));

app.post("/api/projects/:id/synthesize", asyncHandler(async (req, res) => {
    const project = await startSynthesisJob(req.params.id, {
      provider: req.body?.ttsProvider || DEFAULT_TTS_PROVIDER,
      voice: req.body?.voice || DEFAULT_TTS_VOICE,
      rate: req.body?.ttsRate || process.env.WEB_VIDEO_TTS_RATE || "0",
      volume: req.body?.ttsVolume || process.env.WEB_VIDEO_TTS_VOLUME || "100",
      format: req.body?.ttsFormat || process.env.WEB_VIDEO_TTS_FORMAT || "mp3",
      force: Boolean(req.body?.force),
    });
    res.status(202).json(project);
}));

app.post("/api/projects/:id/render", asyncHandler(async (req, res) => {
    const project = await startRenderJob(req.params.id, {
      synthesizeFirst: Boolean(req.body?.synthesizeFirst),
      forceAudio: Boolean(req.body?.forceAudio),
      provider: req.body?.ttsProvider || DEFAULT_TTS_PROVIDER,
      voice: req.body?.voice || DEFAULT_TTS_VOICE,
      rate: req.body?.ttsRate || process.env.WEB_VIDEO_TTS_RATE || "0",
      volume: req.body?.ttsVolume || process.env.WEB_VIDEO_TTS_VOLUME || "100",
      format: req.body?.ttsFormat || process.env.WEB_VIDEO_TTS_FORMAT || "mp3",
    });
    res.status(202).json(project);
}));

app.use(express.static(path.join(root, "dist")));
app.get("*", (_req, res) => {
  res.sendFile(path.join(root, "dist", "index.html"));
});

app.use((error, _req, res, _next) => {
  console.error(error);
  sendError(error, res);
});

app.listen(SERVER_PORT, "127.0.0.1", () => {
  console.log(`web-video backend listening on http://127.0.0.1:${SERVER_PORT}`);
});

function isAllowedLocalOrigin(origin) {
  return origin === "http://127.0.0.1:5174" || origin === "http://localhost:5174";
}
