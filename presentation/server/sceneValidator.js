const SCENE_TYPES = new Set([
  "chat",
  "workflow",
  "comparison",
  "case-study",
  "mechanism",
  "document",
  "data",
  "boundary",
  "summary",
]);

export function validateScenePlan(plan) {
  const issues = [];
  if (!plan || typeof plan !== "object") {
    return { ok: false, issues: ["ScenePlan must be an object"], normalized: null };
  }

  if (!clean(plan.id)) issues.push("id is required");
  if (!SCENE_TYPES.has(clean(plan.type))) issues.push(`unsupported scene type: ${clean(plan.type)}`);
  if (!clean(plan.intent)) issues.push("intent is required");
  if (!clean(plan.claim)) issues.push("claim is required");
  if (!clean(plan.startState) || !clean(plan.endState)) issues.push("startState and endState are required");

  const actors = Array.isArray(plan.actors) ? plan.actors : [];
  const actorIds = new Set();
  actors.forEach((actor, index) => {
    if (!clean(actor?.id) || !clean(actor?.role) || !clean(actor?.label)) {
      issues.push(`actors[${index}] must have id, role and label`);
    }
    if (actorIds.has(clean(actor?.id))) issues.push(`duplicate actor id: ${clean(actor?.id)}`);
    actorIds.add(clean(actor?.id));
  });
  if (actors.length === 0) issues.push("at least one actor is required");

  const messages = Array.isArray(plan.messages) ? plan.messages : [];
  const messageIds = new Set();
  messages.forEach((message, index) => {
    if (!clean(message?.id) || !clean(message?.actorId) || !clean(message?.text)) {
      issues.push(`messages[${index}] must have id, actorId and text`);
    }
    if (!actorIds.has(clean(message?.actorId))) issues.push(`messages[${index}] references an unknown actor`);
    if (messageIds.has(clean(message?.id))) issues.push(`duplicate message id: ${clean(message?.id)}`);
    messageIds.add(clean(message?.id));
  });

  const timeline = plan.timeline;
  const durationMs = Number(timeline?.durationMs);
  if (!Number.isFinite(durationMs) || durationMs < 1200) issues.push("timeline.durationMs must be at least 1200ms");
  const keyframes = Array.isArray(timeline?.keyframes) ? timeline.keyframes : [];
  if (keyframes.length < 2) issues.push("timeline.keyframes must contain a start and end keyframe");
  if (keyframes[0]?.atMs !== 0) issues.push("the first keyframe must be at 0ms");
  if (keyframes.at(-1)?.atMs !== durationMs) issues.push("the final keyframe must be at durationMs");
  for (let index = 1; index < keyframes.length; index += 1) {
    if (!(Number(keyframes[index]?.atMs) > Number(keyframes[index - 1]?.atMs))) {
      issues.push(`keyframes[${index}] must be later than the previous keyframe`);
    }
  }

  const actions = Array.isArray(plan.actions) ? plan.actions : [];
  const actionIds = new Set();
  actions.forEach((action, index) => {
    const startMs = Number(action?.startMs);
    const endMs = Number(action?.endMs);
    if (!clean(action?.id) || !clean(action?.targetId) || !clean(action?.verb) || !clean(action?.reason)) {
      issues.push(`actions[${index}] must have id, targetId, verb and reason`);
    }
    if (!actorIds.has(clean(action?.targetId)) && !messageIds.has(clean(action?.targetId))) {
      issues.push(`actions[${index}] references an unknown target`);
    }
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || startMs < 0 || endMs <= startMs || endMs > durationMs) {
      issues.push(`actions[${index}] has invalid time bounds`);
    }
    if (actionIds.has(clean(action?.id))) issues.push(`duplicate action id: ${clean(action?.id)}`);
    actionIds.add(clean(action?.id));
  });
  keyframes.forEach((frame, index) => {
    for (const actionId of Array.isArray(frame?.completedActionIds) ? frame.completedActionIds : []) {
      if (!actionIds.has(clean(actionId))) issues.push(`keyframes[${index}] references an unknown action`);
    }
  });

  return {
    ok: issues.length === 0,
    issues,
    normalized: issues.length === 0 ? { ...plan, timeline: { ...timeline, durationMs } } : null,
  };
}

function clean(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}
