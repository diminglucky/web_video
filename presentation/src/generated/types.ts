import type { ChapterDef } from "../registry/types";
import type { ScenePlan } from "./sceneTypes";

export interface GeneratedSegment {
  chapter: string;
  step: number;
  text: string;
  narration?: string;
  audio: string;
}

export type GeneratedVisualKind =
  | "chat"
  | "agent-run"
  | "loop"
  | "capabilities"
  | "tools"
  | "memory"
  | "risk"
  | "default";

export interface GeneratedVisualSpec {
  kind?: GeneratedVisualKind | string;
  action?: string;
  subject?: string;
  detail?: string;
  labels?: string[];
  continuity?: GeneratedContinuity;
  storyboard?: GeneratedStoryboard;
  scenePlan?: ScenePlan;
}

export interface GeneratedContinuity {
  case?: string;
  state?: string;
  change?: string;
  artifact?: string;
  artifactType?: GeneratedArtifactType | string;
}

export type GeneratedArtifactType =
  | "code"
  | "document"
  | "chat"
  | "table"
  | "branch"
  | "timeline"
  | "log"
  | "metric"
  | "quote"
  | "none";

export type GeneratedSceneType =
  | "contrast"
  | "workflow"
  | "capability-loop"
  | "tool-call"
  | "memory"
  | "risk-boundary"
  | "scenario"
  | "explain";

export interface GeneratedStoryboard {
  sceneType?: GeneratedSceneType | string;
  sceneIntent?: string;
  layout?: string;
  claim?: string;
  entities?: string[];
  beforeState?: string;
  actionSequence?: string[];
  afterState?: string;
  evidence?: string[];
  visualMetaphor?: string;
  contentObjects?: GeneratedContentObject[];
  relations?: GeneratedRelation[];
  motion?: GeneratedMotion[];
  emphasis?: string;
}

export interface GeneratedContentObject {
  id?: string;
  type?: string;
  label?: string;
  value?: string;
  detail?: string;
  status?: string;
  emphasis?: string;
}

export interface GeneratedRelation {
  from?: string;
  to?: string;
  label?: string;
  type?: string;
}

export interface GeneratedMotion {
  target?: string;
  action?: string;
  at?: string;
}

export interface GeneratedChapter {
  id: string;
  title: string;
  steps: string[];
  narrations?: string[];
  visuals?: GeneratedVisualSpec[];
}

export interface GeneratedWorkflow {
  scriptApproved?: boolean;
  storyboardApproved?: boolean;
  scriptApprovedAt?: string;
  storyboardApprovedAt?: string;
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
    rate?: string;
    volume?: string;
    format?: string;
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
  generation?: {
    provider?: string;
    model?: string;
    baseUrl?: string;
    fallbackReason?: string;
    generatedAt?: string;
  };
  workflow?: GeneratedWorkflow;
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
  audioByStep: Record<string, string>;
}
