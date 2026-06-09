import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { projectDir } from "./config.js";
import {
  deleteProject,
  readProject,
  saveProject,
  updateProjectDraft,
} from "./projectStore.js";

const TEST_ID = "20990101000000-abcdef";
const MISSING_ID = "20990101000001-abcdef";

test.beforeEach(async () => {
  await fs.rm(projectDir(TEST_ID), { recursive: true, force: true });
  await fs.rm(projectDir(MISSING_ID), { recursive: true, force: true });
});

test.afterEach(async () => {
  await fs.rm(projectDir(TEST_ID), { recursive: true, force: true });
  await fs.rm(projectDir(MISSING_ID), { recursive: true, force: true });
});

test("saveProject and readProject round-trip project JSON", async () => {
  await saveProject(baseProject());
  const project = await readProject(TEST_ID);

  assert.equal(project.id, TEST_ID);
  assert.equal(project.title, "测试项目");
  assert.equal(project.segments.length, 1);
});

test("updateProjectDraft normalizes chapters and resets generated outputs", async () => {
  await saveProject({
    ...baseProject(),
    audio: [{ chapter: "opening", step: 1, audio: "opening/1.mp3" }],
    video: { file: "render/video.mp4" },
    jobs: { render: { status: "success" } },
  });

  const project = await updateProjectDraft(TEST_ID, {
    title: " 新标题 ",
    chapters: [
      { id: "第一章", title: "", steps: ["  A  ", "", "B"] },
      { id: "", title: "空步骤章", steps: [] },
    ],
  });

  assert.equal(project.title, "新标题");
  assert.equal(project.status, "draft");
  assert.equal(project.revision, 1);
  assert.equal(project.chapters.length, 1);
  assert.equal(project.chapters[0].id, "chapter-1");
  assert.deepEqual(project.chapters[0].steps, ["A", "B"]);
  assert.equal(project.audio, undefined);
  assert.equal(project.video, undefined);
  assert.deepEqual(project.jobs, {});
});

test("readProject rejects invalid and missing ids with typed errors", async () => {
  await assert.rejects(() => readProject("../bad"), {
    status: 400,
    code: "BAD_REQUEST",
  });
  await assert.rejects(() => readProject(MISSING_ID), {
    status: 404,
    code: "NOT_FOUND",
  });
});

test("deleteProject removes the project directory", async () => {
  await saveProject(baseProject());
  const result = await deleteProject(TEST_ID);

  assert.deepEqual(result, { id: TEST_ID, deleted: true });
  await assert.rejects(() => readProject(TEST_ID), {
    status: 404,
    code: "NOT_FOUND",
  });
});

function baseProject() {
  return {
    id: TEST_ID,
    title: "测试项目",
    content: "测试内容",
    createdAt: "2099-01-01T00:00:00.000Z",
    updatedAt: "2099-01-01T00:00:00.000Z",
    status: "draft",
    tts: { provider: "edge-tts", voice: "zh-CN-YunxiNeural" },
    jobs: {},
    chapters: [{ id: "opening", title: "开场", steps: ["测试内容"] }],
    segments: [
      {
        chapter: "opening",
        step: 1,
        text: "测试内容",
        audio: "opening/1.mp3",
      },
    ],
  };
}
