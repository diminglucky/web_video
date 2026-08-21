import test from "node:test";
import assert from "node:assert/strict";
import { buildChapterVisuals, normalizeVisualSpec } from "./visualPlanner.js";

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
  assert.equal(visual.continuity.case, "客服问题处理");
  assert.equal(visual.continuity.artifact, "一个可检查的结果");
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

test("artifact evidence follows the content instead of defaulting to code", () => {
  const documentVisual = normalizeVisualSpec(
    { continuity: { artifact: "会议纪要和总结报告" } },
    { chapterTitle: "办公协作", stepText: "整理会议内容" },
  );
  const branchVisual = normalizeVisualSpec(
    { continuity: { artifact: "简单问题直接处理，复杂问题转人工" } },
    { chapterTitle: "客服分流", stepText: "判断问题类型" },
  );

  assert.equal(documentVisual.continuity.artifactType, "document");
  assert.equal(branchVisual.continuity.artifactType, "branch");
});

test("content without code gets a matching evidence scene", () => {
  const documentVisual = normalizeVisualSpec({}, { chapterTitle: "办公协作", stepText: "整理会议纪要" });
  const tableVisual = normalizeVisualSpec({}, { chapterTitle: "方案比较", stepText: "用数据对比两个方案" });
  const timelineVisual = normalizeVisualSpec({}, { chapterTitle: "项目管理", stepText: "追踪每个阶段的进度" });
  const metricVisual = normalizeVisualSpec({}, { chapterTitle: "结果", stepText: "转化率增长了 24%" });

  assert.equal(documentVisual.continuity.artifactType, "document");
  assert.equal(tableVisual.continuity.artifactType, "table");
  assert.equal(timelineVisual.continuity.artifactType, "timeline");
  assert.equal(metricVisual.continuity.artifactType, "metric");
});

test("tool scenes use narration evidence when saved visual data is generic", () => {
  const visual = normalizeVisualSpec(
    {
      kind: "tools",
      continuity: { artifactType: "none" },
      storyboard: {
        sceneType: "tool-call",
        evidence: ["工具请求", "返回片段", "汇总卡片"],
      },
    },
    {
      chapterTitle: "它如何把目标变成结果",
      stepText: "工具调用要留下证据",
      narrationText: "查询航班时间、价格和余票，再把返回信息整理成表格或文档，观众才能看见为什么选择这个方案。",
    },
  );

  assert.equal(visual.continuity.artifactType, "document");
  assert.deepEqual(visual.storyboard.evidence, [
    "航班时间、价格和余票",
    "住宿位置、价格和取消规则",
    "行程选择依据",
    "列出子任务",
  ]);
});

test("chapter titles do not leak evidence types into unrelated steps", () => {
  const visuals = buildChapterVisuals({
    id: "difference",
    title: "Agent 和聊天机器人的区别",
    steps: ["Agent 继续往下做", "关键是拆任务和反馈"],
  });

  assert.equal(visuals[0].continuity.artifactType, "none");
  assert.equal(visuals[1].continuity.artifactType, "none");
});
