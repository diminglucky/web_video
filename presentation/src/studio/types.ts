import type { GeneratedProject } from "../generated/types";

export type Provider = "edge-tts" | "say" | "openai" | "piper";
export type StudioPage = "compose" | "edit" | "export" | "library";

export interface Health {
  ok: boolean;
  defaultProvider: string;
  defaultVoice: string;
  openaiConfigured: boolean;
  chromeConfigured: boolean;
  ffmpegConfigured?: boolean;
  ffprobeConfigured?: boolean;
  ttsConfigured?: boolean;
  renderBaseUrl: string;
  checks?: {
    chrome?: { ok: boolean; path: string; message: string };
    ffmpeg?: { ok: boolean; command: string; message: string };
    ffprobe?: { ok: boolean; command: string; message: string };
    tts?: {
      provider: string;
      openaiConfigured: boolean;
      edgeTtsAvailable: boolean;
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
