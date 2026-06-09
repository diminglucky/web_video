import type { ChapterDef } from "../registry/types";

export interface GeneratedSegment {
  chapter: string;
  step: number;
  text: string;
  audio: string;
}

export interface GeneratedChapter {
  id: string;
  title: string;
  steps: string[];
}

export interface GeneratedProject {
  id: string;
  title: string;
  createdAt: string;
  updatedAt?: string;
  content: string;
  status: string;
  tts?: {
    provider?: string;
    voice?: string;
  };
  jobs?: Record<
    string,
    {
      status?: string;
      startedAt?: string | null;
      finishedAt?: string | null;
      error?: string | null;
      count?: number;
      durationMs?: number;
    }
  >;
  audio?: Array<{
    chapter: string;
    step: number;
    audio: string;
    status?: string;
  }>;
  video?: {
    file: string;
    url: string;
    frames: number;
    durationMs: number;
    renderedAt: string;
  };
  chapters: GeneratedChapter[];
  segments: GeneratedSegment[];
}

export interface RuntimeAudioOptions {
  basePath?: string;
}

export interface RuntimeProject {
  id: string;
  title: string;
  chapters: ChapterDef[];
  audioBasePath: string;
}
