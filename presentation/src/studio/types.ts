import type { GeneratedProject } from "../generated/types";

export type Provider = "edge-tts" | "say" | "openai" | "piper" | "windows-sapi";
export type StudioPage =
  | "script"
  | "storyboard"
  | "design"
  | "export"
  | "projects"
  | "settings";

export interface Health {
  ok: boolean;
  version?: string;
  defaultProvider: string;
  defaultVoice: string;
  openaiConfigured: boolean;
  chromeConfigured: boolean;
  ffmpegConfigured?: boolean;
  ffprobeConfigured?: boolean;
  ttsConfigured?: boolean;
  renderBaseUrl: string;
  checks?: {
    localExecution?: {
      ok: boolean;
      code: string;
      message: string;
    };
    chrome?: { ok: boolean; path: string; message: string };
    ffmpeg?: { ok: boolean; command: string; message: string };
    ffprobe?: { ok: boolean; command: string; message: string };
    tts?: {
      provider: string;
      openaiConfigured: boolean;
      edgeTtsAvailable: boolean;
      windowsSapiAvailable?: boolean;
      windowsSapiVoices?: string[];
      sayAvailable: boolean;
      piperAvailable: boolean;
      piperModelConfigured: boolean;
    };
  };
}

export interface ProjectListItem {
  id: string;
  title: string;
  createdAt: string;
  status?: string;
  provider?: string;
  segmentCount: number;
  hasAudio?: boolean;
  hasVideo?: boolean;
}

export type DraftChapters = GeneratedProject["chapters"];

export interface StudioSettingsValues {
  WEB_VIDEO_RENDER_BASE_URL: string;
  WEB_VIDEO_CHROME_PATH: string;
  WEB_VIDEO_RENDER_FPS: string;
  WEB_VIDEO_RENDER_SETTLE_MS: string;
  WEB_VIDEO_TTS_PROVIDER: Provider;
  WEB_VIDEO_TTS_VOICE: string;
  WEB_VIDEO_TTS_RATE: string;
  WEB_VIDEO_TTS_VOLUME: string;
  WEB_VIDEO_TTS_FORMAT: string;
  WEB_VIDEO_TTS_FALLBACK: string;
  WEB_VIDEO_TTS_FALLBACK_VOICE: string;
  WEB_VIDEO_SCRIPT_PROVIDER: "llm-required" | "llm-auto" | "local";
  WEB_VIDEO_LLM_MODEL: string;
  WEB_VIDEO_LLM_TIMEOUT_MS: string;
  OPENAI_API_KEY: string;
  OPENAI_BASE_URL: string;
  OPENAI_TTS_BASE_URL: string;
  OPENAI_TTS_MODEL: string;
  PIPER_BIN: string;
  PIPER_MODEL: string;
}

export interface StudioSettings {
  values: StudioSettingsValues;
  secrets: {
    OPENAI_API_KEY: boolean;
  };
}

export interface LlmModelItem {
  id: string;
  ownedBy?: string;
}

export interface LlmModelTestResult {
  ok: boolean;
  baseUrl: string;
  models: LlmModelItem[];
}

export interface TtsTestResult {
  ok: boolean;
  baseUrl: string;
  model: string;
  voice: string;
}

export interface LocalTtsTestResult {
  ok: boolean;
  provider: Provider;
  voice: string;
  rate: number;
  volume: number;
  format: string;
}

export type SaveSettingsInput = StudioSettingsValues & {
  OPENAI_API_KEY_CLEAR?: boolean;
};
