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

test("saveProject sanitizes repeated meta filler in stored narration", async () => {
  await saveProject({
    ...baseProject(),
    content:
      "Agent 会推进任务。 这部分需要听众理解背后的原因，而不只是看见屏幕上的一句话。",
    segments: [
      {
        chapter: "opening",
        step: 1,
        text: "Agent 会推进任务",
        narration:
          "Agent 会推进任务。 这部分需要听众理解背后的原因，而不只是看见屏幕上的一句话。",
        audio: "opening/1.mp3",
      },
    ],
  });

  const project = await readProject(TEST_ID);

  assert.equal(project.content, "Agent 会推进任务。");
  assert.equal(project.segments[0].narration, "Agent 会推进任务。");
});

test("saveProject reduces awkward repeated narration phrasing", async () => {
  await saveProject({
    ...baseProject(),
    segments: [
      {
        chapter: "opening",
        step: 1,
        text: "办公自动化",
        narration:
          "比如，在办公场景里，Agent 的价值主要来自重复流程自动化。比如，在办公场景里，Agent 可以帮你整理会议纪要。",
        audio: "opening/1.mp3",
      },
    ],
  });

  const project = await readProject(TEST_ID);

  assert.equal(
    project.segments[0].narration,
    "比如，在办公场景里，Agent 的价值主要来自重复流程自动化。比如，Agent 可以帮你整理会议纪要。",
  );
});

test("readProject hydrates missing segment screen text from chapter steps", async () => {
  await saveProject({
    ...baseProject(),
    chapters: [
      {
        id: "opening",
        title: "开场",
        steps: ["屏幕文案"],
        narrations: ["真实口播"],
      },
    ],
    segments: [
      {
        chapter: "opening",
        step: 1,
        text: "",
        narration: "真实口播",
        audio: "opening/1.mp3",
      },
    ],
  });

  const project = await readProject(TEST_ID);

  assert.equal(project.segments[0].text, "屏幕文案");
  assert.equal(project.segments[0].narration, "真实口播");
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

test("updateProjectDraft keeps screen copy separate from narration", async () => {
  await saveProject(baseProject());

  const project = await updateProjectDraft(TEST_ID, {
    title: "分离文本",
    chapters: [
      {
        id: "opening",
        title: "开场",
        steps: ["屏幕短句"],
        narrations: ["这是一段更完整的真实口播，会用于语音合成。"],
      },
    ],
  });

  assert.deepEqual(project.chapters[0].steps, ["屏幕短句"]);
  assert.deepEqual(project.chapters[0].narrations, [
    "这是一段更完整的真实口播，会用于语音合成。",
  ]);
  assert.equal(project.segments[0].text, "屏幕短句");
  assert.equal(
    project.segments[0].narration,
    "这是一段更完整的真实口播，会用于语音合成。",
  );
  assert.equal(project.content, "这是一段更完整的真实口播，会用于语音合成。");
});

test("updateProjectDraft keeps narration aligned when empty screen steps are removed", async () => {
  await saveProject(baseProject());

  const project = await updateProjectDraft(TEST_ID, {
    title: "删除空屏",
    chapters: [
      {
        id: "opening",
        title: "开场",
        steps: ["保留第一屏", "   ", "保留第三屏"],
        narrations: ["第一屏口播", "空屏口播不应错位", "第三屏口播"],
      },
    ],
  });

  assert.deepEqual(project.chapters[0].steps, ["保留第一屏", "保留第三屏"]);
  assert.deepEqual(project.chapters[0].narrations, ["第一屏口播", "第三屏口播"]);
  assert.equal(project.segments[0].narration, "第一屏口播");
  assert.equal(project.segments[1].text, "保留第三屏");
  assert.equal(project.segments[1].narration, "第三屏口播");
});

test("updateProjectDraft persists workflow approval state", async () => {
  await saveProject(baseProject());

  const scriptApproved = await updateProjectDraft(TEST_ID, {
    title: "确认文稿",
    chapters: [{ id: "opening", title: "开场", steps: ["屏幕文案"] }],
    workflow: {
      scriptApproved: true,
      storyboardApproved: false,
      scriptApprovedAt: "2099-01-01T01:00:00.000Z",
    },
  });

  assert.equal(scriptApproved.workflow.scriptApproved, true);
  assert.equal(scriptApproved.workflow.storyboardApproved, false);
  assert.equal(
    scriptApproved.workflow.scriptApprovedAt,
    "2099-01-01T01:00:00.000Z",
  );

  const storyboardApproved = await updateProjectDraft(TEST_ID, {
    title: "确认分镜",
    chapters: [{ id: "opening", title: "开场", steps: ["屏幕文案"] }],
    workflow: {
      scriptApproved: true,
      storyboardApproved: true,
      storyboardApprovedAt: "2099-01-01T02:00:00.000Z",
    },
  });

  assert.equal(storyboardApproved.workflow.scriptApproved, true);
  assert.equal(storyboardApproved.workflow.storyboardApproved, true);
  assert.equal(
    storyboardApproved.workflow.scriptApprovedAt,
    "2099-01-01T01:00:00.000Z",
  );
  assert.equal(
    storyboardApproved.workflow.storyboardApprovedAt,
    "2099-01-01T02:00:00.000Z",
  );

  const changedDraft = await updateProjectDraft(TEST_ID, {
    title: "修改文稿",
    chapters: [{ id: "opening", title: "开场", steps: ["改过的屏幕文案"] }],
    workflow: {
      scriptApproved: false,
      storyboardApproved: false,
    },
  });

  assert.equal(changedDraft.workflow.scriptApproved, false);
  assert.equal(changedDraft.workflow.storyboardApproved, false);
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

test("updateProjectDraft deduplicates chapter ids", async () => {
  await saveProject(baseProject());

  const project = await updateProjectDraft(TEST_ID, {
    title: "Deduped",
    chapters: [
      { id: "same", title: "One", steps: ["A"] },
      { id: "same", title: "Two", steps: ["B"] },
      { id: "中文", title: "Three", steps: ["C"] },
      { id: "中文", title: "Four", steps: ["D"] },
    ],
  });

  assert.deepEqual(
    project.chapters.map((chapter) => chapter.id),
    ["same", "same-2", "chapter-3", "chapter-4"],
  );
  assert.deepEqual(
    project.segments.map((segment) => segment.audio),
    ["same/1.mp3", "same-2/1.mp3", "chapter-3/1.mp3", "chapter-4/1.mp3"],
  );
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
