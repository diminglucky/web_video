const DEFAULT_TITLE = "AI Agent 科普视频";

export function buildProjectFromInput({ title, content }) {
  const normalizedTitle = clean(title) || DEFAULT_TITLE;
  const seed = cleanMultiline(content);
  const source = seed || "什么是 AI Agent？它和普通聊天机器人有什么区别？";
  const segments = makeSegments(source);
  const chapters = [
    {
      id: "opening",
      title: "开场",
      steps: segments.slice(0, 3),
    },
    {
      id: "explain",
      title: "核心解释",
      steps: segments.slice(3, 6),
    },
    {
      id: "takeaway",
      title: "收束",
      steps: segments.slice(6, 9),
    },
  ].filter((chapter) => chapter.steps.length > 0);

  return {
    title: normalizedTitle,
    content: source,
    chapters,
    segments: chapters.flatMap((chapter) =>
      chapter.steps.map((text, index) => ({
        chapter: chapter.id,
        step: index + 1,
        text,
        audio: `${chapter.id}/${index + 1}.mp3`,
      })),
    ),
  };
}

function makeSegments(content) {
  const manualSegments = content
    .split(/\n---+\n/g)
    .map(clean)
    .filter(Boolean);
  if (manualSegments.length >= 3) {
    return manualSegments.slice(0, 18);
  }

  const sentences = content
    .replace(/\r/g, "")
    .split(/(?<=[。！？!?])\s*|\n+/g)
    .map(clean)
    .filter(Boolean);

  const compact = [];
  let buf = "";
  for (const sentence of sentences) {
    const next = buf ? `${buf}${sentence}` : sentence;
    if (next.length > 58 && buf) {
      compact.push(buf);
      buf = sentence;
    } else {
      buf = next;
    }
  }
  if (buf) compact.push(buf);

  const base = compact.length ? compact : [content];
  while (base.length < 9) {
    const i = base.length;
    if (i === 1) base.push("我们先把它拆开看：目标、工具、记忆和规划，是 Agent 能继续做事的关键。");
    else if (i === 2) base.push("它不是突然有了人格，而是模型接上了工具，并被允许围绕目标多走几步。");
    else if (i === 3) base.push("当任务需要查资料、判断、操作和复核时，Agent 工作流就开始有价值。");
    else if (i === 4) base.push("但它也会出错：判断错、任务拆歪、工具调错，都会让后面的步骤跑偏。");
    else if (i === 5) base.push("所以可靠的 Agent 一定要有边界：工具权限、确认动作、过程记录和结果验收。");
    else if (i === 6) base.push("判断一个 Agent 靠不靠谱，可以先问：目标是什么？能用什么工具？怎么知道做对了？");
    else base.push("这就是 Agent 从聊天走向执行的核心变化。");
  }
  return base.slice(0, 9);
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
