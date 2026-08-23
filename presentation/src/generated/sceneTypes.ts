export type SceneType =
  | "chat"
  | "workflow"
  | "comparison"
  | "case-study"
  | "mechanism"
  | "document"
  | "data"
  | "boundary"
  | "summary";

export interface SceneActor {
  id: string;
  role: string;
  label: string;
}

export interface SceneMessage {
  id: string;
  actorId: string;
  text: string;
  tone?: "question" | "answer" | "evidence" | "decision";
}

export interface SceneAction {
  id: string;
  targetId: string;
  verb: string;
  reason: string;
  startMs: number;
  endMs: number;
  fromValue?: string | number | boolean;
  toValue?: string | number | boolean;
  easing?: string;
}

export interface SceneTimelineKeyframe {
  atMs: number;
  state: string;
  visibleActorIds: string[];
  completedActionIds: string[];
}

export interface SceneTimeline {
  durationMs: number;
  keyframes: SceneTimelineKeyframe[];
}

export interface ScenePlan {
  id: string;
  type: SceneType;
  intent: string;
  claim: string;
  actors: SceneActor[];
  messages: SceneMessage[];
  actions: SceneAction[];
  timeline: SceneTimeline;
  startState: string;
  endState: string;
}

export interface SceneState {
  timeMs: number;
  visibleActorIds: string[];
  visibleMessageIds: string[];
  completedActionIds: string[];
  activeActionIds: string[];
  state: string;
  progress: number;
}

export function getSceneState(plan: ScenePlan, timeMs = plan.timeline.durationMs): SceneState {
  const durationMs = Math.max(1, plan.timeline.durationMs);
  const clampedTime = Math.min(Math.max(0, timeMs), durationMs);
  const completedActionIds = plan.actions
    .filter((action) => action.endMs <= clampedTime)
    .map((action) => action.id);
  const activeActionIds = plan.actions
    .filter((action) => action.startMs <= clampedTime && action.endMs > clampedTime)
    .map((action) => action.id);
  const visibleMessageIds = plan.messages
    .filter((message) => completedActionIds.includes(`show-${message.id}`))
    .map((message) => message.id);
  const visibleActorIds = plan.actors
    .filter((actor) => visibleMessageIds.some((id) => plan.messages.find((message) => message.id === id)?.actorId === actor.id))
    .map((actor) => actor.id);
  const keyframe = [...plan.timeline.keyframes]
    .reverse()
    .find((frame) => frame.atMs <= clampedTime);

  return {
    timeMs: clampedTime,
    visibleActorIds,
    visibleMessageIds,
    completedActionIds,
    activeActionIds,
    state: keyframe?.state || plan.startState,
    progress: clampedTime / durationMs,
  };
}
