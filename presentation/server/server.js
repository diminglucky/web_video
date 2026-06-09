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
import { buildProjectFromInput } from "./scriptPlanner.js";
import { asyncHandler, sendError } from "./errors.js";
import { getRuntimeHealth } from "./runtimeChecks.js";
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

app.use(express.json({ limit: "1mb" }));
app.use("/storage/projects", express.static(PROJECTS_DIR));

app.get("/api/health", asyncHandler(async (_req, res) => {
  const runtime = await getRuntimeHealth();
  res.json({
    ok: true,
    defaultProvider: DEFAULT_TTS_PROVIDER,
    defaultVoice: DEFAULT_TTS_VOICE,
    openaiConfigured: Boolean(process.env.OPENAI_API_KEY),
    chromeConfigured: runtime.chromeConfigured,
    ffmpegConfigured: runtime.ffmpegConfigured,
    ffprobeConfigured: runtime.ffprobeConfigured,
    ttsConfigured: runtime.ttsConfigured,
    renderBaseUrl: RENDER_BASE_URL,
    checks: runtime.checks,
  });
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
      synthesize = false,
      render = false,
    } = req.body || {};
    const base = buildProjectFromInput({ title, content });
    const id = newProjectId();
    const project = {
      ...base,
      id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      tts: {
        provider: ttsProvider || DEFAULT_TTS_PROVIDER,
        voice: voice || DEFAULT_TTS_VOICE,
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
      });
    }

    res.status(201).json(await readProject(id));
}));

app.put("/api/projects/:id", asyncHandler(async (req, res) => {
    res.json(
      await updateProjectDraft(req.params.id, {
        title: req.body?.title,
        chapters: req.body?.chapters,
      }),
    );
}));

app.delete("/api/projects/:id", asyncHandler(async (req, res) => {
  res.json(await deleteProject(req.params.id));
}));

app.post("/api/projects/:id/synthesize", asyncHandler(async (req, res) => {
    const project = await startSynthesisJob(req.params.id, {
      provider: req.body?.ttsProvider,
      voice: req.body?.voice,
      force: Boolean(req.body?.force),
    });
    res.status(202).json(project);
}));

app.post("/api/projects/:id/render", asyncHandler(async (req, res) => {
    const project = await startRenderJob(req.params.id, {
      synthesizeFirst: Boolean(req.body?.synthesizeFirst),
      forceAudio: Boolean(req.body?.forceAudio),
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
