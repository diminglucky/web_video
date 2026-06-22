import { buildProjectFromInput } from "./scriptPlanner.js";
import { badRequest, failedDependency } from "./errors.js";
import { sanitizeGeneratedText } from "./textSanitizer.js";
import { attachVisualPlans, normalizeVisualSpec } from "./visualPlanner.js";

const DEFAULT_MODEL = "gpt-4o-mini";
const DEFAULT_BASE_URL = "https://api.openai.com/v1";
const MAX_LLM_CHAPTERS = 7;
const MAX_LLM_STEPS_PER_CHAPTER = 5;

export async function buildProjectWithGenerator(input) {
  const mode = process.env.WEB_VIDEO_SCRIPT_PROVIDER || "llm-required";
  if (mode === "local") {
    return withGeneration(attachVisualPlans(buildProjectFromInput(input)), {
      provider: "local",
      model: "rule-planner",
    });
  }

  try {
    return await buildProjectWithLlm(input);
  } catch (error) {
    if (mode === "llm-auto") {
      return withGeneration(attachVisualPlans(buildProjectFromInput(input)), {
        provider: "local-fallback",
        model: "rule-planner",
        fallbackReason: error.message,
      });
    }
    throw error;
  }
}

export async function buildProjectWithLlm({ title, content }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw failedDependency(
      "未配置 OPENAI_API_KEY，无法调用大模型生成文稿。请先到设置页面填写 API Key。",
    );
  }

  const model = process.env.WEB_VIDEO_LLM_MODEL || DEFAULT_MODEL;
  const baseUrl = normalizeBaseUrl(process.env.OPENAI_BASE_URL || DEFAULT_BASE_URL);
  const timeoutMs = Number(process.env.WEB_VIDEO_LLM_TIMEOUT_MS || 45000);
  const prompt = buildPrompt({ title, content });
  const data = await requestChatCompletion({
    apiKey,
    baseUrl,
    model,
    prompt,
    timeoutMs,
  });
  const project = attachVisualPlans(normalizeLlmProject(data, { title, content }));

  return withGeneration(project, {
    provider: "llm",
    model,
    baseUrl,
  });
}

async function requestChatCompletion({ apiKey, baseUrl, model, prompt, timeoutMs }) {
  const body = {
    model,
    temperature: 0.72,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "你是中文教学型视频编剧、复杂知识讲解老师和网页视频分镜设计师。只输出 JSON，不要 Markdown。你的目标是把复杂知识讲得通俗、完整、详细，并用例子帮助理解。每一屏都必须先判断这一页要证明什么关系，再输出能被网页渲染的语义分镜 storyboard，不能只给装饰性标签。",
      },
      {
        role: "user",
        content: prompt,
      },
    ],
  };

  const response = await fetchWithTimeout(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  }, timeoutMs);

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw failedDependency(`大模型生成失败：${response.status} ${trimDetail(detail)}`);
  }

  const result = await response.json();
  const text = result?.choices?.[0]?.message?.content;
  if (!text) {
    throw failedDependency("大模型没有返回可解析的文稿内容。");
  }
  return parseJsonFromModel(text);
}

function buildPrompt({ title, content }) {
  return [
    "请根据用户素材，生成一个中文教学型网页视频口播稿。",
    "核心目标：把一个复杂知识点讲得通俗易懂、完整详细，中间自然穿插例子。不是短摘要，不是提纲，不是只读屏幕文字。",
    "",
    "讲解结构必须覆盖：",
    "A. 先用大白话解释这个知识点到底在解决什么问题。",
    "B. 给出清晰定义，但不要一上来堆术语。",
    "C. 拆开工作机制或逻辑链路，让观众知道它为什么成立。",
    "D. 至少穿插 2 个具体例子：一个生活/工作类比，一个真实使用场景。",
    "E. 解释常见误区、适用边界和容易踩坑的地方。",
    "F. 最后用一套可复述的框架收束，帮助观众判断自己是否听懂。",
    "",
    "输出 JSON，结构必须是：",
    "{",
    '  "title": "视频标题",',
    '  "chapters": [',
    '    { "id": "opening", "title": "章节标题", "steps": [',
    "      {",
    '        "screen": "屏幕上显示的短句",',
    '        "narration": "这一屏对应的详细口播讲解",',
    '        "visual": {',
    '          "kind": "dialogue | workflow | loop | capabilities | tool-chain | memory | boundary | default",',
    '          "action": "这一页画面正在演什么动作，例如 simulate-message / advance-task-chain",',
    '          "subject": "画面主体，例如聊天机器人停在回答 / Agent 继续推进任务",',
    '          "detail": "为什么这个视觉和这一页内容匹配",',
    '          "labels": ["画面节点1", "画面节点2", "画面节点3"],',
    '          "storyboard": {',
    '            "sceneType": "contrast | workflow | capability-loop | tool-call | memory | risk-boundary | scenario | explain",',
    '            "claim": "这一页要让观众相信的核心判断",',
    '            "entities": ["画面里真实出现的主体1", "主体2", "主体3"],',
    '            "beforeState": "动画开始前的状态",',
    '            "actionSequence": ["动作1", "动作2", "动作3"],',
    '            "afterState": "动画结束后的状态",',
    '            "evidence": ["屏幕上能支撑 claim 的具体细节1", "细节2"],',
    '            "visualMetaphor": "具体画面隐喻，例如 split-screen comparison / command center / approval gate"',
    "          }",
    "        }",
    "      }",
    "    ] }",
    "  ]",
    "}",
    "",
    "要求：",
    "1. 生成 5 到 7 个章节，每章 3 到 5 屏，总屏数 15 到 28 屏。复杂知识宁可多拆几屏，不要压成几句口号。",
    "2. screen 是屏幕短句：10 到 28 个中文字符，像视频画面标题，不要塞满解释。",
    "3. narration 是真正口播：180 到 360 个中文字符。要像老师讲课一样解释原因、机制、例子和边界，不能只是重复 screen。",
    "4. 每个 narration 必须能单独听懂，并自然衔接上一屏；每 2 到 3 屏至少出现一次具体例子、类比、反例或小测试。",
    "5. id 只能使用小写英文、数字和连字符。",
    "6. visual 必须跟每一页 screen/narration 的内容匹配，不能整章都用同一种 kind。",
    "7. storyboard 是最重要的：先写 claim，再写实体、前后状态、动作链。画面必须演 actionSequence，而不是只展示 labels。",
    "8. 如果讲聊天机器人和 Agent 区别，用 contrast；讲继续执行任务用 workflow；讲反馈调整用 loop；讲能力结构用 capability-loop；讲调用工具用 tool-call；讲记住进度用 memory；讲风险边界用 risk-boundary；讲办公/客服/开发等应用用 scenario。",
    "9. visual 只描述画面意图和节点，不要输出颜色、CSS、代码或 Markdown。",
    "10. 禁止输出元解释废话，例如“这部分需要听众理解背后的原因，而不只是看见屏幕上的一句话”“这一屏要强调的是”。直接讲内容本身，不要评价观众应该怎么理解屏幕。",
    "11. narration 不能机械重复同一句信息或同一个场景名。不要写“比如，在办公场景里……在办公场景里……”，不要写“最后，所以”，不要连续用“具体来说/换句话说/更安全的方式是”复述上一句。",
    "12. 讲解必须满足“五问”：它是什么、为什么出现、怎么运转、举个例子、边界在哪里。缺任何一项都算不合格。",
    "13. 如果用户素材很短，也要围绕主题补全一版完整教学稿；如果素材很长，优先保留原素材里的关键例子、数字、对比和结论。",
    "",
    `视频主题：${clean(title) || "未命名视频"}`,
    "",
    "用户素材：",
    cleanMultiline(content) || "请围绕主题自行生成一版完整科普口播稿。",
  ].join("\n");
}

function normalizeLlmProject(data, input) {
  const fallbackTitle = clean(input.title) || "AI 生成视频";
  const title = clean(data?.title) || fallbackTitle;
  const rawChapters = Array.isArray(data?.chapters) ? data.chapters : [];
  const usedIds = new Set();
  const chapters = rawChapters
    .map((chapter, index) => {
      const id = uniqueId(normalizeId(chapter?.id, index), usedIds);
      const chapterTitle = clean(chapter?.title) || `第 ${index + 1} 章`;
      const steps = Array.isArray(chapter?.steps)
        ? chapter.steps
            .map(normalizeStep)
            .filter((step) => step.screen)
            .slice(0, MAX_LLM_STEPS_PER_CHAPTER)
        : [];
      return { id, title: chapterTitle, steps };
    })
    .filter((chapter) => chapter.steps.length > 0)
    .slice(0, MAX_LLM_CHAPTERS);

  if (chapters.length === 0) {
    throw failedDependency("大模型返回了空文稿，请调整素材或模型后重试。");
  }

  const publicChapters = chapters.map((chapter) => ({
    id: chapter.id,
    title: chapter.title,
    steps: chapter.steps.map((step) => step.screen),
    narrations: chapter.steps.map((step) => step.narration || step.screen),
    visuals: chapter.steps.map((step, index) =>
      normalizeVisualSpec(step.visual, {
        chapterId: chapter.id,
        chapterTitle: chapter.title,
        stepText: step.screen,
        stepIndex: index,
      }),
    ),
  }));

  return {
    title,
    content: chapters
      .flatMap((chapter) => chapter.steps.map((step) => step.narration || step.screen))
      .join("\n---\n"),
    chapters: publicChapters,
    segments: buildSegments(chapters),
  };
}

function buildSegments(chapters) {
  return chapters.flatMap((chapter) =>
    chapter.steps.map((step, index) => ({
      chapter: chapter.id,
      step: index + 1,
      text: step.screen,
      narration: step.narration || step.screen,
      audio: `${chapter.id}/${index + 1}.mp3`,
    })),
  );
}

function normalizeStep(value) {
  if (typeof value === "string") {
    const text = sanitizeGeneratedText(value);
    return { screen: text, narration: text, visual: null };
  }
  const screen = sanitizeGeneratedText(value?.screen || value?.text || value?.title);
  const narration =
    sanitizeGeneratedText(value?.narration || value?.voiceover || value?.spoken || screen) ||
    screen;
  return { screen, narration, visual: value?.visual };
}

function withGeneration(project, details) {
  return {
    ...project,
    generation: {
      ...details,
      generatedAt: new Date().toISOString(),
    },
  };
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw failedDependency(`大模型请求超时：${timeoutMs}ms。`);
    }
    throw failedDependency(`无法连接大模型接口：${error.message}`);
  } finally {
    clearTimeout(timer);
  }
}

function parseJsonFromModel(text) {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw badRequest("大模型返回内容不是 JSON。");
    try {
      return JSON.parse(match[0]);
    } catch {
      throw badRequest("大模型返回 JSON 解析失败。");
    }
  }
}

function normalizeBaseUrl(value) {
  return String(value || DEFAULT_BASE_URL).replace(/\/+$/u, "");
}

function normalizeId(value, index) {
  const id = clean(value)
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return id || `chapter-${index + 1}`;
}

function uniqueId(id, usedIds) {
  let next = id;
  let suffix = 2;
  while (usedIds.has(next)) {
    next = `${id}-${suffix}`;
    suffix += 1;
  }
  usedIds.add(next);
  return next;
}

function clean(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function cleanMultiline(value) {
  return String(value || "")
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function trimDetail(value) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > 300 ? `${text.slice(0, 300)}...` : text;
}
