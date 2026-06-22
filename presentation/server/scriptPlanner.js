const DEFAULT_TITLE = "AI Agent 科普视频";
const MAX_LOCAL_STEPS = 15;

export function buildProjectFromInput({ title, content }) {
  const normalizedTitle = clean(title) || DEFAULT_TITLE;
  const seed = cleanMultiline(content);
  const source = seed || "什么是 AI Agent？它和普通聊天机器人有什么区别？";
  const steps = makeTeachingSteps(source, normalizedTitle);
  const chapters = buildChapters(steps);

  return {
    title: normalizedTitle,
    content: chapters
      .flatMap((chapter) => chapter.narrations)
      .join("\n---\n"),
    chapters,
    segments: chapters.flatMap((chapter) =>
      chapter.steps.map((text, index) => ({
        chapter: chapter.id,
        step: index + 1,
        text,
        narration: chapter.narrations[index] || text,
        audio: `${chapter.id}/${index + 1}.mp3`,
      })),
    ),
  };
}

function buildChapters(steps) {
  const chapterDefs = [
    { id: "plain-language", title: "先讲人话" },
    { id: "mental-model", title: "建立模型" },
    { id: "examples", title: "例子拆开看" },
    { id: "pitfalls", title: "误区与边界" },
    { id: "takeaway", title: "完整收束" },
  ];

  return chapterDefs
    .map((chapter, index) => {
      const chunk = steps.slice(index * 3, index * 3 + 3);
      return {
        ...chapter,
        steps: chunk.map((step) => step.screen),
        narrations: chunk.map((step) => step.narration),
      };
    })
    .filter((chapter) => chapter.steps.length > 0);
}

function makeTeachingSteps(content, title) {
  const manualSegments = content
    .split(/\n---+\n/g)
    .map(clean)
    .filter(Boolean);
  if (manualSegments.length >= 3) {
    return manualSegments.slice(0, MAX_LOCAL_STEPS).map((text, index) => ({
      screen: makeManualScreenText(text, index),
      narration: text,
    }));
  }

  const topic = clean(title) || inferTopic(content);
  const sentences = splitSentences(content);
  const summary = sentences.slice(0, 2).join("") || content;
  const detail = sentences.slice(2, 5).join("") || summary;
  const example = findExample(sentences, topic);

  return [
    {
      screen: "先把问题说成人话",
      narration: `我们先不急着背定义。${topic}真正要解决的，是一个人面对复杂任务时最常遇到的问题：信息很多、步骤很多、判断也很多。先把它说成人话，就是把一个抽象概念拆成“目标、条件、步骤、结果”四件事。后面讲任何细节，都围绕这四件事展开。`,
    },
    {
      screen: "一句话抓住核心",
      narration: `如果只记一句话，可以先这样理解：${trimTo(summary, 120)}。这句话不一定覆盖所有细节，但它能先给你一个抓手。复杂知识最怕一上来堆术语，先抓住主线，后面的定义、机制和例子才有地方挂。`,
    },
    {
      screen: "为什么它容易混乱",
      narration: `这个知识点容易听乱，通常不是因为它真的玄，而是因为大家把不同层次混在一起讲：有的人在讲概念边界，有的人在讲工作流程，还有的人直接讲应用场景。我们要做的是先分层，再解释每一层之间怎么连起来。`,
    },
    {
      screen: "第一层：它是什么",
      narration: `${topic}的第一层，是先回答“它到底是什么”。这里不要追求一句完美定义，而要知道它在整个问题里扮演什么角色。可以把它想成地图上的一个节点：它不是全部路线，但它决定你接下来该往哪个方向理解。`,
    },
    {
      screen: "第二层：它怎么运转",
      narration: `第二层要看运转方式。一个概念如果只知道名字，很快就会忘；但如果知道它从什么输入开始，经过哪些步骤，最后产生什么结果，就更容易记住。${trimTo(detail, 110)}这类信息就应该放在流程里理解。`,
    },
    {
      screen: "第三层：它解决什么",
      narration: `第三层是价值，也就是它到底解决什么问题。很多复杂概念看起来高级，本质上是在减少某种麻烦：减少重复劳动、减少判断成本、减少信息整理成本，或者让一个原本模糊的过程变得可以检查。`,
    },
    {
      screen: "用一个例子落地",
      narration: `举个例子会更清楚。${example}例子的作用不是把所有情况都讲完，而是让你看到抽象概念在真实场景里会怎么发生：谁输入了什么，系统或人做了什么，最后结果为什么变好了，或者哪里可能出错。`,
    },
    {
      screen: "把例子拆成步骤",
      narration: `我们把这个例子拆开看，通常会有三步：第一步，识别当前问题；第二步，选择合适的方法或工具；第三步，检查结果是不是满足目标。只要能拆成这三步，观众就不只是听懂一个名词，而是能跟着它走一遍。`,
    },
    {
      screen: "再换一个角度看",
      narration: `换个角度说，一个知识点真正讲明白，不是只告诉你“它很重要”，而是让你知道什么时候该用它，什么时候不该用它。能用的场景、不能用的场景、用错会怎样，这三件事加起来才算完整。`,
    },
    {
      screen: "常见误解是什么",
      narration: `这里要特别提醒一个常见误解：不要把${topic}理解成一个万能答案。任何复杂概念都有适用范围。如果忽略前提，只记结论，就很容易在真实问题里用错。真正可靠的理解，一定会同时包含条件和边界。`,
    },
    {
      screen: "边界决定可信度",
      narration: `边界为什么重要？因为边界告诉我们：哪些事情它能解释，哪些事情它解释不了；哪些场景它有帮助，哪些场景反而会增加成本。一个讲解如果没有边界，就像只有油门没有刹车，听起来很爽，但不够可信。`,
    },
    {
      screen: "判断是否真的听懂",
      narration: `判断自己是不是真的听懂，可以用一个小测试：你能不能不用原话，把它讲给一个完全没背景的人听？能不能举出一个自己的例子？能不能说出一个不适合使用它的场景？如果这三点都能做到，才算比较稳。`,
    },
    {
      screen: "把主线重新串起来",
      narration: `现在把主线串起来：先用人话建立直觉，再用定义固定边界，然后用流程解释它怎么运转，接着用例子把抽象内容落到现实，最后再补上误区和限制。这个顺序，适合大多数复杂知识点。`,
    },
    {
      screen: "你应该带走什么",
      narration: `你真正应该带走的，不是一串术语，而是一套理解方法。以后再遇到类似概念，可以先问五个问题：它是什么？为什么出现？怎么运转？能解决什么？边界在哪里？这五问能帮你快速搭起框架。`,
    },
    {
      screen: "完整但不堆砌",
      narration: `最后收束一下：通俗易懂不等于讲得少，完整详细也不等于堆信息。好的讲解应该像带路，先告诉你站在哪里，再告诉你往哪走，中间用例子照亮关键路口，最后让你自己也能复述这条路线。`,
    },
  ];
}

function splitSentences(content) {
  return content
    .replace(/\r/g, "")
    .split(/(?<=[。！？!?])\s*|\n+/g)
    .map(clean)
    .filter(Boolean);
}

function findExample(sentences, topic) {
  const explicit = sentences.find((sentence) => /比如|例如|举例|假设|场景/u.test(sentence));
  if (explicit) return trimTo(explicit, 130);
  return `假设我们要向一个新同事解释“${topic}”，不能只丢给他一个定义，而要拿一个具体任务做演示：先说明目标，再展示过程，最后对照结果。`;
}

function makeScreenText(text, index) {
  const cleaned = clean(text).replace(/[，。！？；：,.!?;:]/g, " ");
  const first = cleaned.split(/\s+/u).find(Boolean) || `第 ${index + 1} 屏`;
  return trimTo(first, 18);
}

function makeManualScreenText(text, index) {
  return trimTo(clean(text) || `第 ${index + 1} 屏`, 28);
}

function inferTopic(content) {
  const first = splitSentences(content)[0] || "这个知识点";
  return trimTo(first.replace(/[？?。！!]/g, ""), 24) || "这个知识点";
}

function trimTo(text, max) {
  const cleaned = clean(text);
  return cleaned.length > max ? `${cleaned.slice(0, max - 1)}…` : cleaned;
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
