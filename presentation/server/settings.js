import fs from "node:fs/promises";
import { ENV_FILE, refreshRuntimeConfig } from "./config.js";

const SETTING_FIELDS = [
  "WEB_VIDEO_RENDER_BASE_URL",
  "WEB_VIDEO_CHROME_PATH",
  "WEB_VIDEO_RENDER_FPS",
  "WEB_VIDEO_RENDER_SETTLE_MS",
  "WEB_VIDEO_TTS_PROVIDER",
  "WEB_VIDEO_TTS_VOICE",
  "WEB_VIDEO_TTS_RATE",
  "WEB_VIDEO_TTS_VOLUME",
  "WEB_VIDEO_TTS_FORMAT",
  "WEB_VIDEO_TTS_FALLBACK",
  "WEB_VIDEO_TTS_FALLBACK_VOICE",
  "WEB_VIDEO_SCRIPT_PROVIDER",
  "WEB_VIDEO_LLM_MODEL",
  "WEB_VIDEO_LLM_TIMEOUT_MS",
  "OPENAI_API_KEY",
  "OPENAI_BASE_URL",
  "OPENAI_TTS_BASE_URL",
  "OPENAI_TTS_MODEL",
  "PIPER_BIN",
  "PIPER_MODEL",
];

const DEFAULT_SETTINGS = {
  WEB_VIDEO_RENDER_BASE_URL: "http://127.0.0.1:5174",
  WEB_VIDEO_CHROME_PATH: "",
  WEB_VIDEO_RENDER_FPS: "30",
  WEB_VIDEO_RENDER_SETTLE_MS: "1400",
  WEB_VIDEO_TTS_PROVIDER: "windows-sapi",
  WEB_VIDEO_TTS_VOICE: "Microsoft Huihui Desktop - Chinese (Simplified)",
  WEB_VIDEO_TTS_RATE: "0",
  WEB_VIDEO_TTS_VOLUME: "100",
  WEB_VIDEO_TTS_FORMAT: "mp3",
  WEB_VIDEO_TTS_FALLBACK: "none",
  WEB_VIDEO_TTS_FALLBACK_VOICE: "Tingting",
  WEB_VIDEO_SCRIPT_PROVIDER: "llm-required",
  WEB_VIDEO_LLM_MODEL: "gpt-4o-mini",
  WEB_VIDEO_LLM_TIMEOUT_MS: "45000",
  OPENAI_API_KEY: "",
  OPENAI_BASE_URL: "https://api.openai.com/v1",
  OPENAI_TTS_BASE_URL: "",
  OPENAI_TTS_MODEL: "gpt-4o-mini-tts",
  PIPER_BIN: "piper",
  PIPER_MODEL: "",
};

export async function readSettings() {
  const values = await readEnvValues();
  return presentSettings(values);
}

export async function saveSettings(input) {
  const current = await readEnvValues();
  const next = { ...current };
  const shouldClearApiKey = Boolean(input?.OPENAI_API_KEY_CLEAR);

  for (const key of SETTING_FIELDS) {
    if (!(key in (input || {}))) continue;
    const value = String(input[key] ?? "").trim();
    if (key === "OPENAI_API_KEY" && value === "") continue;
    next[key] = value;
  }

  if (shouldClearApiKey) {
    next.OPENAI_API_KEY = "";
  }

  await fs.writeFile(ENV_FILE, serializeEnv(next), "utf8");
  for (const [key, value] of Object.entries(next)) {
    process.env[key] = value;
  }
  refreshRuntimeConfig();
  return presentSettings(next);
}

async function readEnvValues() {
  let raw = "";
  try {
    raw = await fs.readFile(ENV_FILE, "utf8");
  } catch {
    raw = "";
  }

  const values = { ...DEFAULT_SETTINGS };
  const keysFromFile = new Set();
  for (const line of raw.split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match || !SETTING_FIELDS.includes(match[1])) continue;
    keysFromFile.add(match[1]);
    values[match[1]] = unquote(match[2].trim());
  }

  for (const key of SETTING_FIELDS) {
    if (!keysFromFile.has(key) && process.env[key] && process.env[key] !== "") {
      values[key] = process.env[key];
    }
  }

  return values;
}

function presentSettings(values) {
  return {
    values: {
      ...values,
      OPENAI_API_KEY: "",
    },
    secrets: {
      OPENAI_API_KEY: Boolean(values.OPENAI_API_KEY),
    },
  };
}

function serializeEnv(values) {
  return `${SETTING_FIELDS.map((key) => `${key}=${quote(values[key] || "")}`).join("\n")}\n`;
}

function quote(value) {
  if (value === "") return "";
  if (/[\s#"']/u.test(value)) return JSON.stringify(value);
  return value;
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
