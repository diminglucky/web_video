import test from "node:test";
import assert from "node:assert/strict";
import { buildProjectFromInput } from "./scriptPlanner.js";

test("buildProjectFromInput creates a default three-chapter draft", () => {
  const project = buildProjectFromInput({
    title: "  ",
    content: "什么是 AI Agent？它能做什么？",
  });

  assert.equal(project.title, "AI Agent 科普视频");
  assert.equal(project.chapters.length, 3);
  assert.equal(project.segments.length, 9);
  assert.equal(project.chapters[0].id, "opening");
  assert.equal(project.segments[0].audio, "opening/1.mp3");
});

test("buildProjectFromInput respects manual --- segment boundaries", () => {
  const content = Array.from({ length: 20 }, (_, i) => `第 ${i + 1} 屏`).join(
    "\n---\n",
  );
  const project = buildProjectFromInput({ title: "手动分屏", content });

  assert.equal(project.title, "手动分屏");
  assert.equal(project.segments.length, 9);
  assert.deepEqual(
    project.segments.map((segment) => segment.text),
    Array.from({ length: 9 }, (_, i) => `第 ${i + 1} 屏`),
  );
});
