import test from "node:test";
import assert from "node:assert/strict";
import { buildProjectFromInput } from "./scriptPlanner.js";

test("buildProjectFromInput creates a detailed teaching draft", () => {
  const project = buildProjectFromInput({
    title: "  ",
    content: "什么是 AI Agent？它能做什么？",
  });

  assert.equal(project.title, "AI Agent 科普视频");
  assert.equal(project.chapters.length, 5);
  assert.equal(project.segments.length, 15);
  assert.equal(project.chapters[0].id, "plain-language");
  assert.equal(project.segments[0].audio, "plain-language/1.mp3");
  assert.ok(project.chapters[0].narrations[0].length > project.chapters[0].steps[0].length);
  assert.equal(project.segments[0].narration, project.chapters[0].narrations[0]);
});

test("buildProjectFromInput respects manual --- segment boundaries", () => {
  const content = Array.from({ length: 20 }, (_, i) => `第 ${i + 1} 屏`).join(
    "\n---\n",
  );
  const project = buildProjectFromInput({ title: "手动分屏", content });

  assert.equal(project.title, "手动分屏");
  assert.equal(project.segments.length, 15);
  assert.deepEqual(
    project.segments.map((segment) => segment.text),
    Array.from({ length: 15 }, (_, i) => `第 ${i + 1} 屏`),
  );
  assert.equal(project.segments[14].narration, "第 15 屏");
});
