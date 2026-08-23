import { validateScenePlan } from "./sceneValidator.js";

export function scenePlanFromLegacyVisual(visual, context = {}) {
  if (visual?.scenePlan) {
    const saved = validateScenePlan(visual.scenePlan);
    return saved.ok ? saved.normalized : null;
  }
  const storyboard = visual?.storyboard || {};
  const kind = clean(visual?.kind).toLowerCase();
  const isChatLike = kind === "chat" || clean(storyboard.sceneType) === "chat";
  const isContrastWithChatEvidence =
    clean(storyboard.sceneType) === "contrast" && clean(visual?.continuity?.artifactType) === "chat";
  if (!isChatLike && !isContrastWithChatEvidence) return null;

  const objects = Array.isArray(storyboard.contentObjects) ? storyboard.contentObjects : [];
  const actors = buildActors(objects, context);
  const messages = buildMessages({ storyboard, context, actors });
  if (messages.length === 0) return null;

  const durationMs = Math.max(3600, messages.length * 1500);
  const sliceMs = durationMs / messages.length;
  const actions = messages.map((message, index) => ({
    id: `show-${message.id}`,
    targetId: message.id,
    verb: "reveal-message",
    reason: index === 0
      ? "先把观众的问题放进真实对话"
      : clean(storyboard.actionSequence?.[index - 1]) || clean(storyboard.claim) || "让下一条信息回应上一条信息",
    startMs: Math.round(index * sliceMs),
    endMs: Math.round((index + 1) * sliceMs),
    easing: "ease-out",
  }));
  const keyframes = [
    {
      atMs: 0,
      state: clean(storyboard.beforeState) || "问题还没有进入对话",
      visibleActorIds: [],
      completedActionIds: [],
    },
    ...messages.map((message, index) => ({
      atMs: actions[index].endMs,
      state: index === messages.length - 1
        ? clean(storyboard.afterState) || "回答和依据已经呈现"
        : `对话推进到：${message.text}`,
      visibleActorIds: unique(messages.slice(0, index + 1).map((item) => item.actorId)),
      completedActionIds: actions.slice(0, index + 1).map((action) => action.id),
    })),
  ];
  const plan = {
    id: `${clean(context.chapterId) || "chapter"}-${Number(context.stepIndex) + 1}-chat`,
    type: "chat",
    intent: clean(storyboard.sceneIntent) || clean(context.stepText) || "让观众看见对话如何推进",
    claim: clean(storyboard.claim) || clean(context.narrationText) || clean(context.stepText) || "对话会带来新的信息",
    actors,
    messages,
    actions,
    timeline: { durationMs, keyframes },
    startState: keyframes[0].state,
    endState: keyframes.at(-1).state,
  };
  return validateScenePlan(plan).normalized;
}

function buildActors(objects, context) {
  const labels = objects.map((item) => clean(item?.label || item?.name)).filter(Boolean);
  const userLabel = labels.find((label) => /(用户|客户|提问|问题|目标)/u.test(label)) || "用户";
  const assistantLabel = labels.find((label) => /(机器人|助手|客服|Agent|系统)/iu.test(label)) || "回应方";
  const actors = [
    { id: "actor-user", role: "user", label: userLabel },
    { id: "actor-assistant", role: "assistant", label: assistantLabel },
  ];
  if (/(客服|人工|转交)/u.test(`${context.stepText} ${context.narrationText}`)) {
    actors.push({ id: "actor-human", role: "human-reviewer", label: "人工处理" });
  }
  return actors;
}

function buildMessages({ storyboard, context, actors }) {
  const sentences = splitSentences(context.narrationText || context.stepText);
  const evidence = Array.isArray(storyboard.evidence) ? storyboard.evidence.map(clean).filter(Boolean) : [];
  const source = unique([clean(context.stepText), ...sentences].filter(Boolean));
  const messages = [];
  const firstText = firstUsefulText(
    clean(storyboard.contentObjects?.[0]?.detail),
    source[0],
  );
  if (firstText) messages.push({ id: "message-1", actorId: actors[0].id, text: firstText, tone: "question" });
  const replyText = firstUsefulText(
    clean(storyboard.contentObjects?.[1]?.detail),
    source[1],
    clean(storyboard.claim),
  );
  if (replyText) messages.push({ id: "message-2", actorId: actors[1].id, text: replyText, tone: "answer" });
  const evidenceText = firstUsefulText(
    clean(storyboard.contentObjects?.[2]?.detail),
    evidence[0],
    source[2],
  );
  if (evidenceText && evidenceText !== replyText) {
    messages.push({ id: "message-3", actorId: actors[1].id, text: evidenceText, tone: "evidence" });
  }
  return messages.slice(0, 4);
}

function firstUsefulText(...values) {
  return values.map(clean).find((value) => value && !isPlaceholder(value)) || "";
}

function isPlaceholder(value) {
  return new Set([
    "回复",
    "建议",
    "任务拆分",
    "执行进度",
    "工具请求",
    "返回片段",
    "汇总卡片",
    "输入",
    "过程",
    "结果",
  ]).has(value);
}

function splitSentences(value) {
  return String(value || "")
    .split(/[。！？!?；;]+/u)
    .map(clean)
    .filter(Boolean)
    .slice(0, 4);
}

function unique(values) {
  return [...new Set(values)];
}

function clean(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}
