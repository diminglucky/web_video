import test from "node:test";
import assert from "node:assert/strict";
import { normalizeVisualSpec } from "./visualPlanner.js";

test("capability visuals always become a semantic closed-loop storyboard", () => {
  const visual = normalizeVisualSpec(
    {
      kind: "capabilities",
      labels: ["四个能力构成闭环"],
    },
    {
      chapterTitle: "工作原理",
      stepText: "四个能力构成闭环",
    },
  );

  assert.equal(visual.kind, "capabilities");
  assert.deepEqual(visual.labels, ["理解目标", "规划任务", "调用工具", "检查结果"]);
  assert.equal(visual.storyboard.sceneType, "capability-loop");
  assert.deepEqual(visual.storyboard.actionSequence, [
    "理解目标",
    "规划任务",
    "调用工具",
    "检查结果",
  ]);
});

test("application examples become scenario storyboards instead of generic cards", () => {
  const visual = normalizeVisualSpec(
    {
      kind: "default",
      labels: ["客服", "查询和分流"],
    },
    {
      chapterTitle: "典型应用场景",
      stepText: "客服：查询和分流",
    },
  );

  assert.equal(visual.storyboard.sceneType, "scenario");
  assert.deepEqual(visual.storyboard.entities, ["用户问题", "知识库", "工单分流"]);
  assert.deepEqual(visual.storyboard.actionSequence, ["识别意图", "查询资料", "分流工单"]);
});

test("sparse workflow labels are expanded into an executable action chain", () => {
  const visual = normalizeVisualSpec(
    {
      kind: "workflow",
      labels: ["查信息"],
    },
    {
      chapterTitle: "Agent 继续执行",
      stepText: "Agent 会继续推进任务",
    },
  );

  assert.equal(visual.kind, "agent-run");
  assert.equal(visual.storyboard.sceneType, "workflow");
  assert.deepEqual(visual.labels, ["查信息", "比选项", "整理结果", "生成清单"]);
  assert.ok(visual.storyboard.actionSequence.length >= 3);
});
