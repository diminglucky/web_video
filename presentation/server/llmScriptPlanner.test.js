import test from "node:test";
import assert from "node:assert/strict";
import { buildProjectWithGenerator } from "./llmScriptPlanner.js";

test("buildProjectWithGenerator requires an API key in llm-required mode", async () => {
  const previousProvider = process.env.WEB_VIDEO_SCRIPT_PROVIDER;
  const previousKey = process.env.OPENAI_API_KEY;
  process.env.WEB_VIDEO_SCRIPT_PROVIDER = "llm-required";
  process.env.OPENAI_API_KEY = "";

  await assert.rejects(
    () =>
      buildProjectWithGenerator({
        title: "测试",
        content: "请生成一段真实的大模型文稿。",
      }),
    {
      status: 424,
      code: "FAILED_DEPENDENCY",
    },
  );

  restore("WEB_VIDEO_SCRIPT_PROVIDER", previousProvider);
  restore("OPENAI_API_KEY", previousKey);
});

test("buildProjectWithGenerator can use explicit local mode", async () => {
  const previousProvider = process.env.WEB_VIDEO_SCRIPT_PROVIDER;
  process.env.WEB_VIDEO_SCRIPT_PROVIDER = "local";

  const project = await buildProjectWithGenerator({
    title: "本地草稿",
    content: "什么是 AI Agent？",
  });

  assert.equal(project.generation.provider, "local");
  assert.equal(project.generation.model, "rule-planner");
  assert.equal(project.chapters.length, 5);
  assert.equal(project.segments.length, 15);
  assert.ok(project.segments[0].narration.length > project.segments[0].text.length);

  restore("WEB_VIDEO_SCRIPT_PROVIDER", previousProvider);
});

test("buildProjectWithGenerator deduplicates repeated LLM chapter ids", async () => {
  const previousProvider = process.env.WEB_VIDEO_SCRIPT_PROVIDER;
  const previousKey = process.env.OPENAI_API_KEY;
  const previousModel = process.env.WEB_VIDEO_LLM_MODEL;
  const previousBase = process.env.OPENAI_BASE_URL;
  const previousFetch = globalThis.fetch;

  process.env.WEB_VIDEO_SCRIPT_PROVIDER = "llm-required";
  process.env.OPENAI_API_KEY = "test-key";
  process.env.WEB_VIDEO_LLM_MODEL = "test-model";
  process.env.OPENAI_BASE_URL = "https://example.test/v1";
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                title: "Demo",
                chapters: [
                  { id: "same", title: "One", steps: ["A"] },
                  { id: "same", title: "Two", steps: ["B"] },
                  { id: "中文", title: "Three", steps: ["C"] },
                  { id: "中文", title: "Four", steps: ["D"] },
                ],
              }),
            },
          },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );

  try {
    const project = await buildProjectWithGenerator({
      title: "Demo",
      content: "Demo content",
    });

    assert.deepEqual(
      project.chapters.map((chapter) => chapter.id),
      ["same", "same-2", "chapter-3", "chapter-4"],
    );
    assert.deepEqual(
      project.segments.map((segment) => segment.audio),
      ["same/1.mp3", "same-2/1.mp3", "chapter-3/1.mp3", "chapter-4/1.mp3"],
    );
  } finally {
    restore("WEB_VIDEO_SCRIPT_PROVIDER", previousProvider);
    restore("OPENAI_API_KEY", previousKey);
    restore("WEB_VIDEO_LLM_MODEL", previousModel);
    restore("OPENAI_BASE_URL", previousBase);
    globalThis.fetch = previousFetch;
  }
});

test("buildProjectWithGenerator separates screen copy from narration", async () => {
  const previousProvider = process.env.WEB_VIDEO_SCRIPT_PROVIDER;
  const previousKey = process.env.OPENAI_API_KEY;
  const previousFetch = globalThis.fetch;

  process.env.WEB_VIDEO_SCRIPT_PROVIDER = "llm-required";
  process.env.OPENAI_API_KEY = "test-key";
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                title: "Demo",
                chapters: [
                  {
                    id: "opening",
                    title: "One",
                    steps: [
                      {
                        screen: "屏幕短句",
                        narration: "这是一段更详细的口播讲解，用来解释屏幕短句背后的含义。",
                      },
                    ],
                  },
                ],
              }),
            },
          },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );

  try {
    const project = await buildProjectWithGenerator({
      title: "Demo",
      content: "Demo content",
    });

    assert.deepEqual(project.chapters[0].steps, ["屏幕短句"]);
    assert.equal(
      project.segments[0].narration,
      "这是一段更详细的口播讲解，用来解释屏幕短句背后的含义。",
    );
  } finally {
    restore("WEB_VIDEO_SCRIPT_PROVIDER", previousProvider);
    restore("OPENAI_API_KEY", previousKey);
    globalThis.fetch = previousFetch;
  }
});

test("buildProjectWithGenerator removes meta filler from narration", async () => {
  const previousProvider = process.env.WEB_VIDEO_SCRIPT_PROVIDER;
  const previousKey = process.env.OPENAI_API_KEY;
  const previousFetch = globalThis.fetch;

  process.env.WEB_VIDEO_SCRIPT_PROVIDER = "llm-required";
  process.env.OPENAI_API_KEY = "test-key";
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                title: "Demo",
                chapters: [
                  {
                    id: "opening",
                    title: "One",
                    steps: [
                      {
                        screen: "Agent 能推进任务",
                        narration:
                          "Agent 会先拆任务，再根据结果调整下一步。 这部分需要听众理解背后的原因，而不只是看见屏幕上的一句话。",
                      },
                    ],
                  },
                ],
              }),
            },
          },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );

  try {
    const project = await buildProjectWithGenerator({
      title: "Demo",
      content: "Demo content",
    });

    assert.equal(
      project.segments[0].narration,
      "Agent 会先拆任务，再根据结果调整下一步。",
    );
    assert.equal(project.content.includes("不只是看见屏幕上的一句话"), false);
  } finally {
    restore("WEB_VIDEO_SCRIPT_PROVIDER", previousProvider);
    restore("OPENAI_API_KEY", previousKey);
    globalThis.fetch = previousFetch;
  }
});

test("buildProjectWithGenerator keeps per-step visual plans from the model", async () => {
  const previousProvider = process.env.WEB_VIDEO_SCRIPT_PROVIDER;
  const previousKey = process.env.OPENAI_API_KEY;
  const previousFetch = globalThis.fetch;

  process.env.WEB_VIDEO_SCRIPT_PROVIDER = "llm-required";
  process.env.OPENAI_API_KEY = "test-key";
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                title: "Demo",
                chapters: [
                  {
                    id: "difference",
                    title: "区别",
                    steps: [
                      {
                        screen: "聊天机器人给建议",
                        narration: "聊天机器人通常只给一份建议，然后停在回答这里。",
                        visual: {
                          kind: "dialogue",
                          action: "simulate-message",
                          subject: "聊天机器人停在回答",
                          detail: "这一屏讲的是只回答不执行。",
                          labels: ["提出旅行问题", "等待回复", "得到建议"],
                        },
                      },
                      {
                        screen: "Agent 继续执行",
                        narration: "Agent 会继续查资料、比较选项，并整理下一步。",
                        visual: {
                          kind: "workflow",
                          labels: ["查资料", "比较选项", "整理结果"],
                        },
                      },
                    ],
                  },
                ],
              }),
            },
          },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );

  try {
    const project = await buildProjectWithGenerator({
      title: "Demo",
      content: "Demo content",
    });

    assert.equal(project.chapters[0].visuals[0].kind, "chat");
    assert.equal(project.chapters[0].visuals[0].subject, "聊天机器人停在回答");
    assert.equal(project.chapters[0].visuals[1].kind, "agent-run");
    assert.deepEqual(project.chapters[0].visuals[1].labels, [
      "查资料",
      "比较选项",
      "整理结果",
      "查信息",
    ]);
  } finally {
    restore("WEB_VIDEO_SCRIPT_PROVIDER", previousProvider);
    restore("OPENAI_API_KEY", previousKey);
    globalThis.fetch = previousFetch;
  }
});

test("buildProjectWithGenerator asks the LLM for detailed teaching narration with examples", async () => {
  const previousProvider = process.env.WEB_VIDEO_SCRIPT_PROVIDER;
  const previousKey = process.env.OPENAI_API_KEY;
  const previousFetch = globalThis.fetch;
  let requestBody = null;

  process.env.WEB_VIDEO_SCRIPT_PROVIDER = "llm-required";
  process.env.OPENAI_API_KEY = "test-key";
  globalThis.fetch = async (_url, options) => {
    requestBody = JSON.parse(options.body);
    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                title: "Demo",
                chapters: [
                  {
                    id: "opening",
                    title: "One",
                    steps: [
                      {
                        screen: "先讲人话",
                        narration:
                          "我们先用一个例子把复杂知识点讲清楚，再解释它为什么成立、怎么运转，以及边界在哪里。",
                      },
                    ],
                  },
                ],
              }),
            },
          },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };

  try {
    await buildProjectWithGenerator({
      title: "Demo",
      content: "Demo content",
    });

    const prompt = requestBody.messages.map((message) => message.content).join("\n");
    assert.match(prompt, /通俗易懂、完整详细/u);
    assert.match(prompt, /至少穿插 2 个具体例子/u);
    assert.match(prompt, /它是什么、为什么出现、怎么运转、举个例子、边界在哪里/u);
    assert.match(prompt, /贯穿案例/u);
    assert.match(prompt, /artifact/u);
    assert.match(prompt, /artifactType/u);
  } finally {
    restore("WEB_VIDEO_SCRIPT_PROVIDER", previousProvider);
    restore("OPENAI_API_KEY", previousKey);
    globalThis.fetch = previousFetch;
  }
});

function restore(key, value) {
  if (value == null) delete process.env[key];
  else process.env[key] = value;
}
