import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT_DIR = path.resolve(__dirname, "..");
export const STORAGE_DIR = path.join(ROOT_DIR, "storage");
export const PROJECTS_DIR = path.join(STORAGE_DIR, "projects");

loadEnvFile(path.join(ROOT_DIR, ".env"));

export const SERVER_PORT = Number(process.env.WEB_VIDEO_SERVER_PORT || 8787);
export const RENDER_BASE_URL =
  process.env.WEB_VIDEO_RENDER_BASE_URL || "http://127.0.0.1:5174";
export const RENDER_FPS = Number(process.env.WEB_VIDEO_RENDER_FPS || 30);
export const RENDER_SETTLE_MS = Number(
  process.env.WEB_VIDEO_RENDER_SETTLE_MS || 1400,
);
export const CHROME_EXECUTABLE_PATH =
  process.env.WEB_VIDEO_CHROME_PATH ||
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

export const DEFAULT_TTS_PROVIDER =
  process.env.WEB_VIDEO_TTS_PROVIDER || "edge-tts";
export const DEFAULT_TTS_VOICE =
  process.env.WEB_VIDEO_TTS_VOICE || "zh-CN-YunxiNeural";

export function ensureStorage() {
  fs.mkdirSync(PROJECTS_DIR, { recursive: true });
}

export function projectDir(id) {
  return path.join(PROJECTS_DIR, id);
}

export function projectAudioDir(id) {
  return path.join(projectDir(id), "audio");
}

export function projectRenderDir(id) {
  return path.join(projectDir(id), "render");
}

export function projectVideoPath(id) {
  return path.join(projectRenderDir(id), "video.mp4");
}

export function projectJsonPath(id) {
  return path.join(projectDir(id), "project.json");
}

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  const raw = fs.readFileSync(file, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key] != null && process.env[key] !== "") continue;
    process.env[key] = unquote(rawValue.trim());
  }
}

function unquote(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}
