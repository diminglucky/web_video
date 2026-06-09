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
import {
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

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    defaultProvider: DEFAULT_TTS_PROVIDER,
    defaultVoice: DEFAULT_TTS_VOICE,
    openaiConfigured: Boolean(process.env.OPENAI_API_KEY),
    chromeConfigured: Boolean(CHROME_EXECUTABLE_PATH),
    renderBaseUrl: RENDER_BASE_URL,
  });
});

app.get("/api/projects", async (_req, res) => {
  res.json({ projects: await listProjects() });
});

app.get("/api/projects/:id", async (req, res, next) => {
  try {
    res.json(await readProject(req.params.id));
  } catch (error) {
    next(error);
  }
});

app.post("/api/projects", async (req, res, next) => {
  try {
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
  } catch (error) {
    next(error);
  }
});

app.put("/api/projects/:id", async (req, res, next) => {
  try {
    res.json(
      await updateProjectDraft(req.params.id, {
        title: req.body?.title,
        chapters: req.body?.chapters,
      }),
    );
  } catch (error) {
    next(error);
  }
});

app.post("/api/projects/:id/synthesize", async (req, res, next) => {
  try {
    const project = await startSynthesisJob(req.params.id, {
      provider: req.body?.ttsProvider,
      voice: req.body?.voice,
      force: Boolean(req.body?.force),
    });
    res.status(202).json(project);
  } catch (error) {
    next(error);
  }
});

app.post("/api/projects/:id/render", async (req, res, next) => {
  try {
    const project = await startRenderJob(req.params.id, {
      synthesizeFirst: Boolean(req.body?.synthesizeFirst),
      forceAudio: Boolean(req.body?.forceAudio),
    });
    res.status(202).json(project);
  } catch (error) {
    next(error);
  }
});

app.use(express.static(path.join(root, "dist")));
app.get("*", (_req, res) => {
  res.sendFile(path.join(root, "dist", "index.html"));
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ error: error.message || "Internal server error" });
});

app.listen(SERVER_PORT, "127.0.0.1", () => {
  console.log(`web-video backend listening on http://127.0.0.1:${SERVER_PORT}`);
});
