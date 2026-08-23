import test from "node:test";
import assert from "node:assert/strict";
import { validateScenePlan } from "./sceneValidator.js";
import { scenePlanFromLegacyVisual } from "./legacyVisualAdapter.js";

const validPlan = {
  id: "chat-1",
  type: "chat",
  intent: "让观众看见回答如何停在建议",
  claim: "聊天机器人给出回复，但不会替用户继续执行",
  actors: [{ id: "user", role: "user", label: "用户" }],
  messages: [{ id: "message-1", actorId: "user", text: "帮我查一下退款条件" }],
  actions: [{ id: "show-message-1", targetId: "message-1", verb: "reveal", reason: "先呈现真实问题", startMs: 0, endMs: 1600 }],
  timeline: {
    durationMs: 1600,
    keyframes: [
      { atMs: 0, state: "问题进入对话", visibleActorIds: [], completedActionIds: [] },
      { atMs: 1600, state: "问题已经显示", visibleActorIds: ["user"], completedActionIds: ["show-message-1"] },
    ],
  },
  startState: "问题还没有进入对话",
  endState: "问题已经显示",
};

test("validates a deterministic scene timeline", () => {
  const result = validateScenePlan(validPlan);
  assert.equal(result.ok, true);
  assert.equal(result.normalized.timeline.durationMs, 1600);
});

test("rejects invalid targets and non-monotonic keyframes", () => {
  const result = validateScenePlan({
    ...validPlan,
    actions: [{ ...validPlan.actions[0], targetId: "missing", endMs: 2000 }],
    timeline: {
      ...validPlan.timeline,
      keyframes: [validPlan.timeline.keyframes[0], { ...validPlan.timeline.keyframes[1], atMs: 0 }],
    },
  });
  assert.equal(result.ok, false);
  assert.match(result.issues.join(" "), /unknown target/);
  assert.match(result.issues.join(" "), /later than/);
});

test("adapts chat storyboard content into a real message sequence", () => {
  const plan = scenePlanFromLegacyVisual(
    {
      kind: "chat",
      storyboard: {
        sceneType: "scenario",
        claim: "回答之后还要给出退款条件",
        contentObjects: [
          { id: "question", type: "message", label: "用户问题", detail: "我的订单为什么还不能退款？" },
          { id: "answer", type: "message", label: "客服回答", detail: "先核对下单日期和退款期限。" },
          { id: "evidence", type: "document", label: "订单记录", detail: "订单记录显示下单时间是三天前。" },
        ],
      },
    },
    { chapterId: "support", stepIndex: 0, stepText: "退款条件", narrationText: "先核对订单日期，再判断是否满足退款条件。" },
  );
  assert.equal(plan.type, "chat");
  assert.deepEqual(plan.messages.map((message) => message.text), [
    "我的订单为什么还不能退款？",
    "先核对下单日期和退款期限。",
    "订单记录显示下单时间是三天前。",
  ]);
});

test("keeps a valid saved ScenePlan instead of rebuilding it", () => {
  const saved = scenePlanFromLegacyVisual({ scenePlan: validPlan }, { chapterId: "ignored" });
  assert.equal(saved.id, validPlan.id);
  assert.equal(saved.messages[0].text, validPlan.messages[0].text);
});

test("upgrades legacy contrast scenes when their artifact is chat", () => {
  const plan = scenePlanFromLegacyVisual(
    {
      kind: "risk",
      continuity: { artifactType: "chat" },
      storyboard: {
        sceneType: "contrast",
        contentObjects: [
          { label: "用户目标", detail: "回复" },
          { label: "聊天机器人", detail: "任务拆分" },
        ],
      },
    },
    { chapterId: "opening", stepIndex: 0, stepText: "AI Agent不是只会聊天", narrationText: "聊天机器人停在回答，Agent会继续推进任务。" },
  );
  assert.equal(plan.type, "chat");
  assert.equal(plan.messages[0].text, "AI Agent不是只会聊天");
  assert.equal(plan.messages[1].text, "聊天机器人停在回答，Agent会继续推进任务");
});
