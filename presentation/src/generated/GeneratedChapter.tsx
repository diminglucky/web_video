import type { ChapterStepProps } from "../registry/types";
import type {
  GeneratedChapter,
  GeneratedSceneType,
  GeneratedStoryboard,
  GeneratedVisualKind,
  GeneratedVisualSpec,
} from "./types";
import "./GeneratedChapter.css";

interface Props extends ChapterStepProps {
  chapter: GeneratedChapter;
  index: number;
  projectTitle: string;
}

type NormalizedVisual = Required<GeneratedVisualSpec> & {
  kind: GeneratedVisualKind;
  storyboard: Required<GeneratedStoryboard> & { sceneType: GeneratedSceneType };
};

const KIND_ALIASES: Record<string, GeneratedVisualKind> = {
  dialogue: "chat",
  chatbot: "chat",
  chat: "chat",
  workflow: "agent-run",
  execution: "agent-run",
  "agent-run": "agent-run",
  loop: "loop",
  "feedback-loop": "loop",
  capabilities: "capabilities",
  ability: "capabilities",
  "tool-chain": "tools",
  tools: "tools",
  memory: "memory",
  "progress-memory": "memory",
  boundary: "risk",
  risk: "risk",
  default: "default",
};

const DEFAULT_LABELS: Record<GeneratedVisualKind, string[]> = {
  chat: ["提出问题", "等待回复", "得到建议"],
  "agent-run": ["识别目标", "拆成步骤", "推进执行", "检查结果"],
  loop: ["先尝试", "看反馈", "再调整"],
  capabilities: ["理解目标", "规划任务", "调用工具", "检查结果"],
  tools: ["列框架", "查资料", "汇总结果"],
  memory: ["已完成", "进行中", "下一步"],
  risk: ["风险动作", "暂停确认", "人工决定"],
  default: ["概念", "原因", "结论"],
};

export function GeneratedChapterView({
  chapter,
  index,
  projectTitle,
  step,
}: Props) {
  const screenText = clean(chapter.steps[step]) || "这一页的核心结论";
  const narration = clean(chapter.narrations?.[step]) || screenText;
  const visual = normalizeVisualSpec(chapter.visuals?.[step], {
    text: `${screenText} ${narration}`,
    chapterId: chapter.id,
    step,
  });
  const teaching = buildTeachingContent(screenText, narration, visual);
  const progress = `${String(step + 1).padStart(2, "0")} / ${String(
    chapter.steps.length,
  ).padStart(2, "0")}`;
  const density =
    screenText.length > 22 ? "is-long" : screenText.length > 15 ? "is-medium" : "";

  return (
    <section
      className={`gen-scene gen-scene-${visual.kind} gen-story-${visual.storyboard.sceneType} scene-pad`}
    >
      <div className="gen-soft-grid" aria-hidden="true" />
      <div className="gen-topline mono">
        <span>{projectTitle}</span>
        <span>{progress}</span>
      </div>

      <div className="gen-layout" key={`${chapter.id}-${step}`}>
        <main className={`gen-hero ${density}`}>
          <div className="gen-kicker mono">
            Chapter {String(index + 1).padStart(2, "0")} / {chapter.title}
          </div>
          <span className="gen-section-label">这一屏要讲清楚</span>
          <h2>{screenText}</h2>
          <p>{teaching.explanation}</p>
          <div className="gen-context-row">
            <span>{sceneName(visual.storyboard.sceneType)}</span>
            <span>{visual.subject}</span>
          </div>
        </main>

        <aside className="gen-visual-stack">
          <SceneIllustration teaching={teaching} visual={visual} />
          <TeachingBoard teaching={teaching} visual={visual} />
        </aside>
      </div>
    </section>
  );
}

function SceneIllustration({
  teaching,
  visual,
}: {
  teaching: TeachingContent;
  visual: NormalizedVisual;
}) {
  if (visual.storyboard.sceneType === "contrast" || visual.kind === "chat") {
    return (
      <div className="gen-illustration gen-chat-illustration">
        <div className="gen-chat-panel is-bot">
          <span>聊天机器人</span>
          <p>{visual.storyboard.beforeState}</p>
          <strong>给出一段回答</strong>
        </div>
        <div className="gen-chat-panel is-agent">
          <span>Agent</span>
          <p>{visual.storyboard.afterState}</p>
          <strong>继续推进任务</strong>
        </div>
      </div>
    );
  }

  if (visual.storyboard.sceneType === "capability-loop" || visual.kind === "capabilities") {
    return (
      <div className="gen-illustration gen-loop-illustration">
        {visual.storyboard.actionSequence.slice(0, 4).map((item, index) => (
          <div className="gen-loop-node" key={`${item}-${index}`}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            <strong>{item}</strong>
          </div>
        ))}
      </div>
    );
  }

  if (visual.storyboard.sceneType === "tool-call" || visual.kind === "tools") {
    return (
      <div className="gen-illustration gen-tools-illustration">
        {visual.storyboard.actionSequence.slice(0, 3).map((item, index) => (
          <div className="gen-tool-card" key={`${item}-${index}`}>
            <span className="mono">CALL {index + 1}</span>
            <strong>{item}</strong>
            <p>{visual.storyboard.evidence[index] || teaching.points[index]?.detail}</p>
          </div>
        ))}
      </div>
    );
  }

  if (visual.storyboard.sceneType === "memory" || visual.kind === "memory") {
    return (
      <div className="gen-illustration gen-memory-illustration">
        {visual.storyboard.entities.slice(0, 3).map((item, index) => (
          <div className="gen-memory-row" key={`${item}-${index}`}>
            <span />
            <strong>{item}</strong>
            <p>{visual.storyboard.evidence[index] || visual.storyboard.actionSequence[index]}</p>
          </div>
        ))}
      </div>
    );
  }

  if (visual.storyboard.sceneType === "risk-boundary" || visual.kind === "risk") {
    return (
      <div className="gen-illustration gen-risk-illustration">
        <div>
          <span>系统准备行动</span>
          <strong>{visual.storyboard.beforeState}</strong>
        </div>
        <b>需要确认</b>
        <div>
          <span>人做决定</span>
          <strong>{visual.storyboard.afterState}</strong>
        </div>
      </div>
    );
  }

  return (
    <div className="gen-illustration gen-workflow-illustration">
      {teaching.points.map((point, index) => (
        <div key={`${point.title}-${index}`}>
          <span>{String(index + 1).padStart(2, "0")}</span>
          <strong>{point.title}</strong>
        </div>
      ))}
    </div>
  );
}

function TeachingBoard({
  teaching,
  visual,
}: {
  teaching: TeachingContent;
  visual: NormalizedVisual;
}) {
  return (
    <aside className="gen-board" aria-label={visual.detail}>
      <div className="gen-board-head">
        <span className="mono">WHY THIS MATTERS</span>
        <strong>{teaching.claim}</strong>
      </div>

      <div className="gen-proof-list">
        {teaching.points.map((point, index) => (
          <article className="gen-proof" key={`${point.title}-${index}`}>
            <span className="mono">{String(index + 1).padStart(2, "0")}</span>
            <div>
              <strong>{point.title}</strong>
              <p>{point.detail}</p>
            </div>
          </article>
        ))}
      </div>

      {teaching.example && (
        <div className="gen-example">
          <span className="mono">EXAMPLE</span>
          <p>{teaching.example}</p>
        </div>
      )}

      <div className="gen-takeaway">
        <span className="mono">TAKEAWAY</span>
        <strong>{teaching.takeaway}</strong>
      </div>
    </aside>
  );
}

interface TeachingContent {
  claim: string;
  explanation: string;
  example: string;
  takeaway: string;
  points: Array<{ title: string; detail: string }>;
}

function buildTeachingContent(
  screenText: string,
  narration: string,
  visual: NormalizedVisual,
): TeachingContent {
  const sentences = splitSentences(narration);
  const explanation =
    sentences.find((sentence) => !isSameIdea(sentence, screenText)) ||
    visual.storyboard.claim ||
    narration ||
    screenText;
  const example =
    sentences.find((sentence) => /比如|例如|举例|假设|好比|场景|可以把/u.test(sentence)) ||
    "";
  const claim = clampText(visual.storyboard.claim || screenText, 92);
  const takeaway = clampText(
    visual.storyboard.afterState ||
      sentences[sentences.length - 1] ||
      visual.storyboard.evidence[0] ||
      screenText,
    90,
  );
  const actions = completeList(
    visual.storyboard.actionSequence,
    visual.labels,
    visual.storyboard.sceneType === "capability-loop" ? 4 : 3,
  ).slice(0, 3);
  const evidence = completeList(visual.storyboard.evidence, splitKeywords(narration), 3);

  return {
    claim,
    explanation: clampText(explanation, 128),
    example: example ? clampText(example, 118) : "",
    takeaway,
    points: actions.map((action, index) => ({
      title: clampText(action, 18),
      detail: clampText(
        evidence[index] ||
          visual.storyboard.entities[index] ||
          sentences[index + 1] ||
          visual.detail,
        58,
      ),
    })),
  };
}

function normalizeVisualSpec(
  spec: GeneratedVisualSpec | undefined,
  context: { text: string; chapterId: string; step: number },
): NormalizedVisual {
  const fallbackKind = inferKind(context.text, context.chapterId, context.step);
  const kind = normalizeKind(spec?.kind || fallbackKind);
  const labels = completeLabels(kind, cleanArray(spec?.labels), context.text);
  const visual = {
    kind,
    action: clean(spec?.action) || actionForKind(kind),
    subject: clean(spec?.subject) || subjectForKind(kind, context.text),
    detail: clean(spec?.detail) || detailForKind(kind),
    labels,
  };
  return {
    ...visual,
    storyboard: normalizeStoryboard(spec?.storyboard, {
      text: context.text,
      kind,
      labels,
      subject: visual.subject,
      chapterId: context.chapterId,
      step: context.step,
    }),
  };
}

function normalizeStoryboard(
  storyboard: GeneratedStoryboard | undefined,
  context: {
    text: string;
    kind: GeneratedVisualKind;
    labels: string[];
    subject: string;
    chapterId: string;
    step: number;
  },
): NormalizedVisual["storyboard"] {
  const inferred = inferStoryboard(context);
  const sceneType = normalizeSceneType(storyboard?.sceneType || inferred.sceneType);
  const actionSequence = completeList(
    cleanArray(storyboard?.actionSequence),
    inferred.actionSequence,
    sceneType === "capability-loop" ? 4 : 3,
  );
  return {
    sceneType,
    claim: clean(storyboard?.claim) || inferred.claim,
    entities: completeList(cleanArray(storyboard?.entities), inferred.entities, 3),
    beforeState: clean(storyboard?.beforeState) || inferred.beforeState,
    actionSequence,
    afterState: clean(storyboard?.afterState) || inferred.afterState,
    evidence: completeList(cleanArray(storyboard?.evidence), inferred.evidence, 3),
    visualMetaphor: clean(storyboard?.visualMetaphor) || inferred.visualMetaphor,
  };
}

function inferStoryboard(context: {
  text: string;
  kind: GeneratedVisualKind;
  labels: string[];
  subject: string;
  chapterId: string;
  step: number;
}): NormalizedVisual["storyboard"] {
  const sceneType = inferSceneType(context.text, context.kind, context.chapterId, context.step);
  const labels = completeLabels(context.kind, context.labels, context.text);
  if (sceneType === "contrast") {
    return {
      sceneType,
      claim: "同一个目标下，停在回答和继续推进是两种完全不同的能力。",
      entities: ["问题", "回答", "行动"],
      beforeState: "用户提出一个目标",
      actionSequence: ["先给回答", "拆成任务", "继续推进"],
      afterState: "观众看到从建议到执行的差别",
      evidence: ["回答", "任务拆分", "执行进度"],
      visualMetaphor: "split comparison",
    };
  }
  if (sceneType === "capability-loop") {
    return {
      sceneType,
      claim: "真正重要的不是单点能力，而是能力之间形成闭环。",
      entities: ["目标", "计划", "工具", "检查"],
      beforeState: "目标还只是自然语言",
      actionSequence: ["理解目标", "规划任务", "调用工具", "检查结果"],
      afterState: "结果会反馈到下一轮判断",
      evidence: ["目标结构化", "任务拆分", "工具返回", "结果复核"],
      visualMetaphor: "closed loop",
    };
  }
  if (sceneType === "tool-call") {
    return {
      sceneType,
      claim: "计划必须落到真实工具和可检查结果上，才不只是空话。",
      entities: ["计划", "工具", "结果"],
      beforeState: "只有一个待完成计划",
      actionSequence: labels.slice(0, 3),
      afterState: "计划变成可检查的产物",
      evidence: ["请求", "返回", "汇总"],
      visualMetaphor: "command board",
    };
  }
  if (sceneType === "memory") {
    return {
      sceneType,
      claim: "能记住进度，才能把复杂任务接着往下做。",
      entities: ["已完成", "当前", "下一步"],
      beforeState: "任务历史散在上下文里",
      actionSequence: ["读取进度", "标记当前步骤", "留下下一步"],
      afterState: "下一次可以接着推进",
      evidence: ["完成记录", "当前状态", "下一步提示"],
      visualMetaphor: "progress ledger",
    };
  }
  if (sceneType === "risk-boundary") {
    return {
      sceneType,
      claim: "越能行动，越需要清楚知道什么时候必须让人确认。",
      entities: ["行动", "风险", "确认"],
      beforeState: "系统准备执行有后果的动作",
      actionSequence: ["识别风险", "暂停执行", "请求确认"],
      afterState: "人负责决策，系统负责执行",
      evidence: ["边界", "暂停", "确认"],
      visualMetaphor: "approval gate",
    };
  }
  if (sceneType === "scenario") {
    return {
      sceneType,
      claim: "例子要让抽象概念落到真实输入、过程和结果里。",
      entities: ["输入", "过程", "结果"],
      beforeState: "问题还停留在描述里",
      actionSequence: ["识别问题", "执行步骤", "交付结果"],
      afterState: "观众能把概念套回真实场景",
      evidence: ["场景", "动作", "结果"],
      visualMetaphor: "case board",
    };
  }
  return {
    sceneType,
    claim: context.text || "这一页解释一个关键判断。",
    entities: labels.slice(0, 3),
    beforeState: "先看到一个问题",
    actionSequence: labels.slice(0, 3),
    afterState: "收束成一个清晰结论",
    evidence: ["概念", "原因", "结论"],
    visualMetaphor: "teaching board",
  };
}

function normalizeKind(value: unknown): GeneratedVisualKind {
  const key = clean(value).toLowerCase();
  return KIND_ALIASES[key] || "default";
}

function normalizeSceneType(value: unknown): GeneratedSceneType {
  const key = clean(value).toLowerCase();
  if (
    [
      "contrast",
      "workflow",
      "capability-loop",
      "tool-call",
      "memory",
      "risk-boundary",
      "scenario",
      "explain",
    ].includes(key)
  ) {
    return key as GeneratedSceneType;
  }
  return "workflow";
}

function inferKind(text: string, chapterId: string, step: number): GeneratedVisualKind {
  if (/(风险|边界|确认|付款|删除|正式文件|人工|负责|决策)/u.test(text)) return "risk";
  if (/(记住|进度|已经|还差|从零|记录|下一次)/u.test(text)) return "memory";
  if (/(能力|理解目标|规划任务|检查结果|闭环|结构)/u.test(text)) return "capabilities";
  if (/(工具|搜索|资料|文档|代码|测试|报告|调用|API)/u.test(text)) return "tools";
  if (/(反馈|循环|调整|下一步|结果|复核)/u.test(text)) return "loop";
  if (/(继续|执行|推进|自动化|任务)/u.test(text)) return "agent-run";
  if (/(聊天|机器人|回复|建议|对话|客服|问答)/u.test(text)) return "chat";
  if (chapterId === "difference") return step === 0 ? "chat" : step === 1 ? "agent-run" : "loop";
  return "default";
}

function inferSceneType(
  text: string,
  kind: GeneratedVisualKind,
  chapterId: string,
  step: number,
): GeneratedSceneType {
  if (/(区别|不是|而是|相比|对比|聊天机器人.*Agent|Agent.*聊天机器人)/u.test(text)) {
    return "contrast";
  }
  if (/(能力|理解目标|规划任务|检查结果|闭环|结构)/u.test(text)) return "capability-loop";
  if (/(工具|搜索|资料|文档|代码|测试|报告|调用|API)/u.test(text)) return "tool-call";
  if (/(记住|进度|已经|还差|从零|记录|下一次)/u.test(text)) return "memory";
  if (/(风险|边界|确认|付款|删除|正式文件|人工|负责|决策)/u.test(text)) return "risk-boundary";
  if (/(办公|客服|开发|旅行|会议|邮件|工单|编码|整理|例子|比如|例如|假设|场景)/u.test(text)) {
    return "scenario";
  }
  if (chapterId === "difference" && step === 0) return "contrast";
  if (kind === "capabilities") return "capability-loop";
  if (kind === "tools") return "tool-call";
  if (kind === "memory") return "memory";
  if (kind === "risk") return "risk-boundary";
  return "workflow";
}

function actionForKind(kind: GeneratedVisualKind) {
  return {
    chat: "simulate-message",
    "agent-run": "advance-task-chain",
    loop: "draw-feedback-loop",
    capabilities: "reveal-capability-map",
    tools: "connect-tool-chain",
    memory: "check-progress-stack",
    risk: "show-human-boundary",
    default: "focus-and-explain",
  }[kind];
}

function subjectForKind(kind: GeneratedVisualKind, text: string) {
  return {
    chat: "对话停在回答",
    "agent-run": "任务继续推进",
    loop: "反馈后再调整",
    capabilities: "能力形成闭环",
    tools: "工具把计划落地",
    memory: "进度被保留下来",
    risk: "边界需要确认",
    default: splitKeywords(text)[0] || "核心概念",
  }[kind];
}

function detailForKind(kind: GeneratedVisualKind) {
  return {
    chat: "用对比解释回答和行动的差别。",
    "agent-run": "用步骤解释任务如何继续往下推进。",
    loop: "用反馈链解释为什么结果会改变下一步。",
    capabilities: "用能力闭环解释为什么它不是单个按钮。",
    tools: "用工具链解释计划如何变成结果。",
    memory: "用进度记录解释为什么不用每次从零开始。",
    risk: "用确认边界解释哪里必须交给人判断。",
    default: "用结论、原因和证据组成一页讲解。",
  }[kind];
}

function completeLabels(kind: GeneratedVisualKind, labels: string[], text: string) {
  const defaults = DEFAULT_LABELS[kind] || DEFAULT_LABELS.default;
  const fromText = splitKeywords(text);
  const required = kind === "capabilities" || kind === "agent-run" ? 4 : 3;
  return completeList(labels, [...fromText, ...defaults], required).slice(0, 5);
}

function completeList(primary: string[], fallback: string[], minimum: number) {
  const result: string[] = [];
  for (const item of [...primary, ...fallback]) {
    const cleanItem = clean(item);
    if (!cleanItem || result.includes(cleanItem)) continue;
    result.push(cleanItem);
  }
  return result.slice(0, Math.max(minimum, Math.min(5, result.length)));
}

function splitSentences(text: string) {
  const matches = clean(text).match(/[^。！？!?；;]+[。！？!?；;]?/gu) || [];
  return matches.map((sentence) => clean(sentence)).filter(Boolean);
}

function splitKeywords(text: string) {
  const matches = clean(text).match(/[\u4e00-\u9fa5A-Za-z0-9]+/g) || [];
  return matches
    .map((part) => (part.length > 12 ? part.slice(0, 12) : part))
    .filter((part) => part.length >= 2)
    .slice(0, 5);
}

function sceneName(sceneType: GeneratedSceneType) {
  return {
    contrast: "对比",
    workflow: "流程",
    "capability-loop": "闭环",
    "tool-call": "工具",
    memory: "进度",
    "risk-boundary": "边界",
    scenario: "例子",
    explain: "解释",
  }[sceneType];
}

function isSameIdea(sentence: string, screenText: string) {
  const compactSentence = sentence.replace(/\W+/gu, "");
  const compactScreen = screenText.replace(/\W+/gu, "");
  return compactScreen.length > 4 && compactSentence.includes(compactScreen);
}

function clampText(text: string, max: number) {
  const value = clean(text);
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function cleanArray(value: unknown) {
  return Array.isArray(value) ? value.map((item) => clean(item)).filter(Boolean).slice(0, 6) : [];
}

function clean(value: unknown) {
  return String(value || "").replace(/\s+/g, " ").trim();
}
