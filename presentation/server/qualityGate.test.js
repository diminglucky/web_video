import test from "node:test";
import assert from "node:assert/strict";
import { assessTeachingQuality, assertTeachingQuality } from "./qualityGate.js";

function makeProject(narration) {
  return {
    chapters: Array.from({ length: 5 }, (_, chapterIndex) => ({
      id: `chapter-${chapterIndex}`,
      narrations: Array.from({ length: 3 }, () => narration),
    })),
  };
}

test("quality gate rejects shallow scripts", () => {
  const quality = assessTeachingQuality(makeProject("只是一句很短的话。"));
  assert.equal(quality.ok, false);
  assert.match(quality.issues.join(" "), /口播过短/u);
  assert.throws(() => assertTeachingQuality(makeProject("只是一句很短的话。")), {
    code: "SCRIPT_QUALITY_FAILED",
    status: 422,
  });
});

test("quality gate accepts a deep teaching script", () => {
  const narration = "这是一个完整例子。先说明它要解决的问题，再解释为什么会出现这个机制。系统先接收输入，然后经过拆分、判断和执行，最后检查结果是否符合目标。比如在一次旅行规划中，Agent 会先读取出发时间，再比较航班和酒店，发现预算不够时调整方案。它并不是万能答案，涉及付款、删除或发送正式文件时必须停下来请求人工确认。";
  const quality = assessTeachingQuality(makeProject(narration));
  assert.equal(quality.ok, true);
  assert.doesNotThrow(() => assertTeachingQuality(makeProject(narration)));
});
