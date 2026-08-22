import { buildProjectFromInput } from "./scriptPlanner.js";
import { badRequest, failedDependency } from "./errors.js";
import { sanitizeGeneratedText } from "./textSanitizer.js";
import { attachVisualPlans, normalizeVisualSpec } from "./visualPlanner.js";

const DEFAULT_MODEL = "gpt-4o-mini";
const DEFAULT_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_LLM_MAX_TOKENS = 4800;
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
  const maxTokens = normalizeMaxTokens(process.env.WEB_VIDEO_LLM_MAX_TOKENS);
  const prompt = buildPrompt({ title, content });
  const outlineData = await requestChatCompletion({
    apiKey,
    baseUrl,
    model,
    prompt,
    timeoutMs,
    maxTokens: Math.min(maxTokens, 2200),
  });
  // Keep the first response small. Older providers often close the connection
  // when asked for a complete multi-chapter storyboard in one response.
  const data = hasGeneratedSteps(outlineData)
    ? outlineData
    : await completeLlmChapters({
        outline: outlineData,
        title,
        content,
        apiKey,
        baseUrl,
        model,
        timeoutMs,
        maxTokens,
      });
  const project = attachVisualPlans(normalizeLlmProject(data, { title, content }));
  return withGeneration(project, {
    provider: "llm",
    model,
    baseUrl,
  });
}

async function requestChatCompletion({
  apiKey,
  baseUrl,
  model,
  prompt,
  timeoutMs,
  maxTokens,
}) {
  const body = {
    model,
    temperature: 0.72,
    max_tokens: maxTokens,
    messages: [
      {
        role: "system",
        content:
          "你是中文教学型视频编剧、复杂知识讲解老师和网页视频分镜设计师。只输出 JSON，不要 Markdown。你的目标是把复杂知识讲得通俗、完整、详细，并用一个贯穿全片的真实案例帮助理解。每一屏都必须先判断这一页要证明什么关系，再输出能被网页渲染的语义分镜 storyboard，不能只给装饰性标签。",
      },
      {
        role: "user",
        content: prompt,
      },
    ],
  };

  let response;
  let lastError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      response = await fetchWithTimeout(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          Connection: "close",
        },
        body: JSON.stringify(body),
      }, timeoutMs);
      break;
    } catch (error) {
      lastError = error;
      if (attempt === 0 && isRetryableLlmError(error)) {
        await sleep(800);
        continue;
      }
      throw error;
    }
  }

  if (!response) throw lastError || failedDependency("大模型请求失败。");

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
    "叙事主线：先从用户素材中挑一个最具体、最容易看见结果的真实案例作为贯穿案例。后续章节持续推进同一案例，让观众看到它从问题、第一次尝试、分支、工具调用、错误反馈到最终结果的变化。不要每一章重新发明一个互不相关的例子。",
    "",
    "先只输出教学结构 JSON，结构必须是：",
    "{",
    '  "title": "视频标题",',
    '  "case": "贯穿全片的真实案例",',
    '  "chapters": [',
    '    { "id": "opening", "title": "章节标题", "goal": "本章要讲清什么", "example": "本章使用的例子" }',
    "  ]",
    "}",
    "",
    "要求：",
    "1. 生成 5 个章节；章节顺序要覆盖：问题、定义、机制、例子、边界与总结。",
    "2. 只返回结构，不要在本次响应中生成 screen、narration、visual 或额外解释。",
    "3. 贯穿案例要具体，后续每章都能继续推进它。案例可以是客服退款、办公流程或开发任务。",
    "4. 规划要满足“五问”：它是什么、为什么出现、怎么运转、举个例子、边界在哪里。后续画面会使用 artifact 和 artifactType 作为证据。",
    "5. 最终稿必须通俗易懂、完整详细，并至少穿插 2 个具体例子；后续每个例子都要有可呈现的 artifactType。",
    "",
    `视频主题：${clean(title) || "未命名视频"}`,
    "",
    "用户素材：",
    cleanMultiline(content) || "请围绕主题自行生成一版完整科普口播稿。",
  ].join("\n");
}

async function completeLlmChapters({
  outline,
  title,
  content,
  apiKey,
  baseUrl,
  model,
  timeoutMs,
  maxTokens,
}) {
  const chapters = normalizeLlmOutline(outline, title);
  if (chapters.length === 0) {
    throw failedDependency("大模型返回的教学结构不完整，请调整素材或模型后重试。");
  }
  const results = [];
  for (const chapter of chapters) {
    results.push(
      await requestChatCompletion({
        apiKey,
        baseUrl,
        model,
        prompt: buildChapterPrompt({ title, content, outline, chapter }),
        timeoutMs,
        maxTokens: Math.min(maxTokens, 6000),
      }),
    );
  }
  return {
    title: clean(outline?.title) || clean(title) || "AI 生成视频",
    chapters: results.map((result, index) => normalizeLlmChapter(result, chapters[index])),
  };
}

function buildChapterPrompt({ title, content, outline, chapter }) {
  return [
    "请只输出 JSON，不要 Markdown，不要解释：",
    '{ "steps": [{ "screen": "10到28字的屏幕短句", "narration": "180到300字的详细中文口播", "visual": { "kind": "dialogue | workflow | loop | capabilities | tool-chain | memory | boundary | default", "action": "具体动作", "subject": "具体主体", "labels": ["仅作兼容的短标签"], "continuity": { "case": "贯穿案例中的具体对象", "state": "这一屏开始时的状态", "change": "这一屏发生的变化", "artifact": "屏幕上真实可检查的产物", "artifactType": "document | chat | table | branch | timeline | metric | log | code | quote | none" }, "storyboard": { "sceneIntent": "这一屏要让观众看懂的具体关系", "layout": "sequence | comparison | state-change | decision | evidence | definition | map | freeform", "claim": "这一屏证明的具体判断", "beforeState": "变化前", "afterState": "变化后", "emphasis": "需要视觉强调的原因或差异", "contentObjects": [{ "id": "短英文id", "type": "message | person | document | number | decision | tool | state | concept | result", "label": "对象的真实名称", "value": "真实数字或短值，没有就留空", "detail": "对象在本例中的具体含义", "status": "waiting | active | done | blocked | risk，没有就留空" }], "relations": [{ "from": "对象id", "to": "对象id", "label": "两者的真实关系", "type": "leads-to | contrasts | causes | contains | blocks" }], "actionSequence": ["本屏实际发生的动作"], "evidence": ["本屏展示的真实证据"], "motion": [{ "target": "对象id", "action": "appear | move | update | split | pulse", "at": "before | during | after" }] } } }] }',
    "",
    `视频主题：${clean(title) || "未命名视频"}`,
    `贯穿案例：${clean(outline?.case) || "一个具体真实使用案例"}`,
    `本章：${clean(chapter.title)}；本章目标：${clean(chapter.goal)}；本章例子：${clean(chapter.example)}`,
    "本章必须恰好生成 3 屏，口播要讲清原因、机制、例子和边界，不能只重复屏幕短句。",
    "三屏要有节奏变化：解释、证据或例子、推进或收束。三屏必须根据各自内容选择不同 layout；同一章不能把所有画面都输出成左右对比、横向流程或圆环。",
    "contentObjects 必须来自本章口播和用户素材中的真实对象、数字、动作或状态，至少 2 个，最多 6 个。不要使用 INPUT、OUTPUT、SYSTEM、AGENT、结果、过程、重点等空泛占位词，除非它们确实是内容中的对象。",
    "relations 要表达这一屏真正的因果、先后、对比、包含或阻断关系；motion 要描述对象如何变化。没有代码时禁止选择 code 或渲染代码面板；没有真实数字时不要伪造数字。不同章节的对象名称、证据和布局必须跟着内容变化。",
    "visual 必须匹配内容，不要只写装饰性标签；screen 是观众看到的短句，narration 是完整讲解，storyboard 是画面真正要呈现的证据。",
    "禁止元话术和重复句式，直接讲知识本身；不要输出颜色、CSS、代码或 Markdown。",
    "用户素材：",
    cleanMultiline(content) || "围绕视频主题补全一版完整科普讲解。",
  ].join("\n");
}

function hasGeneratedSteps(data) {
  return Array.isArray(data?.chapters) && data.chapters.some(
    (chapter) => Array.isArray(chapter?.steps) && chapter.steps.length > 0,
  );
}

function normalizeLlmOutline(data, title) {
  return (Array.isArray(data?.chapters) ? data.chapters : [])
    .map((chapter, index) => ({
      id: normalizeId(chapter?.id, index),
      title: clean(chapter?.title) || `第 ${index + 1} 章`,
      goal: clean(chapter?.goal) || "解释本章核心概念",
      example: clean(chapter?.example) || "一个具体使用场景",
    }))
    .slice(0, MAX_LLM_CHAPTERS);
}

function normalizeLlmChapter(data, outline) {
  const candidate = Array.isArray(data?.steps)
    ? data
    : Array.isArray(data?.chapters)
      ? data.chapters[0]
      : data;
  return {
    id: outline.id,
    title: outline.title,
    steps: Array.isArray(candidate?.steps) ? candidate.steps : [],
  };
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

function isRetryableLlmError(error) {
  return error?.code === "FAILED_DEPENDENCY" && /无法连接大模型接口|请求超时/u.test(error.message);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseJsonFromModel(text) {
  const source = String(text || "").replace(/^```(?:json)?\s*/iu, "").replace(/\s*```$/u, "").trim();
  const candidates = [source, ...extractBalancedJson(source)];
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // Providers sometimes add a short preamble or trailing explanation.
      // Try the next balanced object before treating the response as broken.
    }
  }
  throw badRequest("大模型返回 JSON 解析失败，请重试；本次响应可能被截断或包含额外文本。");
}

function extractBalancedJson(source) {
  const candidates = [];
  for (let start = 0; start < source.length; start += 1) {
    if (source[start] !== "{") continue;
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let index = start; index < source.length; index += 1) {
      const char = source[index];
      if (inString) {
        if (escaped) escaped = false;
        else if (char === "\\") escaped = true;
        else if (char === '"') inString = false;
        continue;
      }
      if (char === '"') {
        inString = true;
        continue;
      }
      if (char === "{") depth += 1;
      if (char === "}") depth -= 1;
      if (depth === 0) {
        candidates.push(source.slice(start, index + 1));
        break;
      }
    }
  }
  return candidates.sort((a, b) => b.length - a.length);
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

function normalizeMaxTokens(value) {
  const parsed = Number(value || DEFAULT_LLM_MAX_TOKENS);
  if (!Number.isFinite(parsed)) return DEFAULT_LLM_MAX_TOKENS;
  return Math.min(24000, Math.max(4000, Math.round(parsed)));
}
