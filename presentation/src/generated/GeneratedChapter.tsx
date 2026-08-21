import type { ChapterStepProps } from "../registry/types";
import type {
  GeneratedChapter,
  GeneratedArtifactType,
  GeneratedContinuity,
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
  projectCase?: string;
}

type NormalizedVisual = Required<GeneratedVisualSpec> & {
  kind: GeneratedVisualKind;
  continuity: Required<GeneratedContinuity> & { artifactType: GeneratedArtifactType };
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
  projectCase,
  step,
}: Props) {
  const screenText = clean(chapter.steps[step]) || "这一页的核心结论";
  const narration = clean(chapter.narrations?.[step]) || screenText;
  const visual = normalizeVisualSpec(chapter.visuals?.[step], {
    text: `${screenText} ${narration}`,
    chapterId: chapter.id,
    step,
    caseName: projectCase,
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

      <div className="gen-canvas-shell" key={`${chapter.id}-${step}`}>
        <main className={`gen-hero ${density}`}>
          <div className="gen-kicker mono">
            Chapter {String(index + 1).padStart(2, "0")} / {chapter.title}
          </div>
          <div className="gen-title-wrap">
            <div className="gen-case-line">
              <span className="mono">CASE</span>
              <strong>{visual.continuity.case}</strong>
              <span className="gen-case-change">{visual.continuity.change}</span>
            </div>
            <h2>{screenText}</h2>
          </div>
        </main>

        <SceneIllustration
          teaching={teaching}
          visual={visual}
          contentText={screenText}
          narration={narration}
        />
      </div>
    </section>
  );
}

function SceneIllustration({
  teaching,
  visual,
  contentText,
  narration,
}: {
  teaching: TeachingContent;
  visual: NormalizedVisual;
  contentText: string;
  narration: string;
}) {
  const evidenceLabel = visual.continuity.artifact;

  if (visual.storyboard.sceneType === "contrast") {
    return (
      <div className="gen-visual gen-visual-contrast" aria-label={`${visual.detail} ${evidenceLabel}`}>
        <ContinuityNote visual={visual} />
        <div className="gen-visual-axis gen-visual-axis-x" />
        <div className="gen-visual-axis gen-visual-axis-y" />
        <div className="gen-question-node">
          <span className="mono">INPUT</span>
          <div className="gen-question-mark" aria-hidden="true">?</div>
          <strong>目标</strong>
        </div>
        <div className="gen-contrast-lane is-bot">
          <span className="mono">CHATBOT</span>
          <div className="gen-chat-bubbles" aria-hidden="true"><i /><i /><i /></div>
          <strong>回复</strong>
        </div>
        <div className="gen-contrast-lane is-agent">
          <span className="mono">AGENT</span>
          <div className="gen-task-bars" aria-hidden="true"><i /><i /><i /></div>
          <strong>行动</strong>
        </div>
        <svg className="gen-contrast-line" viewBox="0 0 860 420" aria-hidden="true">
          <path d="M 132 138 C 280 138, 350 245, 498 245" />
          <path d="M 132 138 C 314 82, 558 82, 728 164" />
          <circle cx="132" cy="138" r="10" />
          <circle cx="498" cy="245" r="10" />
          <circle cx="728" cy="164" r="10" />
        </svg>
      </div>
    );
  }

  const artifactType = visual.continuity.artifactType;
  if (
    visual.storyboard.sceneType !== "risk-boundary" &&
    artifactType !== "none" &&
    artifactType !== "chat"
  ) {
    return <ArtifactIllustration visual={visual} />;
  }

  if (visual.storyboard.sceneType === "capability-loop") {
    return (
      <div className="gen-visual gen-visual-loop" aria-label={`${visual.detail} ${evidenceLabel}`}>
        <ContinuityNote visual={visual} />
        <svg className="gen-loop-path" viewBox="0 0 760 520" aria-hidden="true">
          <circle cx="380" cy="260" r="182" />
          <path d="M 380 78 L 480 128 L 532 260 L 480 392 L 380 442" />
        </svg>
        <div className="gen-loop-core">
          <span className="mono">SYSTEM</span>
          <strong>AGENT</strong>
        </div>
        {visual.storyboard.actionSequence.slice(0, 4).map((item, index) => (
          <div className={`gen-loop-node gen-loop-node-${index}`} key={`${item}-${index}`}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            <strong>{shortLabel(item, ["目标", "计划", "工具", "复核"][index])}</strong>
          </div>
        ))}
      </div>
    );
  }

  if (visual.storyboard.sceneType === "tool-call") {
    return (
      <div className="gen-visual gen-visual-chain" aria-label={`${visual.detail} ${evidenceLabel}`}>
        <ContinuityNote visual={visual} />
        <div className="gen-chain-input">
          <span className="mono">PLAN</span>
          <div className="gen-tool-glyph is-plan" aria-hidden="true" />
          <strong>任务</strong>
        </div>
        <svg className="gen-chain-line" viewBox="0 0 900 150" aria-hidden="true">
          <path d="M 50 75 H 850" />
        </svg>
        <div className="gen-chain-steps">
        {visual.storyboard.actionSequence.slice(0, 3).map((item, index) => (
          <div className="gen-chain-step" key={`${item}-${index}`}>
            <span className="mono">CALL {index + 1}</span>
            <div className={`gen-tool-glyph is-tool-${index}`} aria-hidden="true" />
            <strong>{shortLabel(item, ["拆分", "调用", "汇总"][index])}</strong>
          </div>
        ))}
        </div>
        <div className="gen-chain-output">
          <span className="mono">OUTPUT</span>
          <div className="gen-result-mark" aria-hidden="true">✓</div>
          <strong>结果</strong>
        </div>
      </div>
    );
  }

  if (visual.storyboard.sceneType === "memory") {
    return (
      <div className="gen-visual gen-visual-ledger" aria-label={`${visual.detail} ${evidenceLabel}`}>
        <ContinuityNote visual={visual} />
        <div className="gen-ledger-head">
          <span className="mono">PROGRESS MEMORY</span>
          <div className="gen-memory-orbit" aria-hidden="true"><i /><i /><i /></div>
          <strong>持续进度</strong>
        </div>
        {visual.storyboard.entities.slice(0, 3).map((item, index) => (
          <div className={`gen-ledger-row gen-ledger-row-${index}`} key={`${item}-${index}`}>
            <span />
            <strong>{shortLabel(item, ["已完成", "进行中", "下一步"][index])}</strong>
            <div className="gen-ledger-bar" aria-hidden="true"><i /></div>
          </div>
        ))}
      </div>
    );
  }

  if (visual.storyboard.sceneType === "risk-boundary") {
    const riskStage = inferRiskStage(contentText);
    return (
      <div className={`gen-visual gen-visual-gate gen-risk-stage-${riskStage}`} aria-label={`${visual.detail} ${evidenceLabel}`}>
        <ContinuityNote visual={visual} />
        <div className="gen-gate-side is-system">
          <span className="mono">{riskStage === "ownership" ? "HUMAN" : "AGENT"}</span>
          <div className="gen-gate-icon is-action" aria-hidden="true"><i /></div>
          <strong>{riskStage === "boundary" ? "准备行动" : riskStage === "confirm" ? "高风险动作" : "定方向"}</strong>
        </div>
        <div className="gen-gate-center">
          <span className="mono">{riskStage === "ownership" ? "DIVIDE" : riskStage === "confirm" ? "CONFIRM" : "BOUNDARY"}</span>
          <b>{riskStage === "boundary" ? "先停在边界" : riskStage === "confirm" ? "需要确认" : "人机分工"}</b>
        </div>
        <div className="gen-gate-side is-human">
          <span className="mono">{riskStage === "ownership" ? "AGENT" : "HUMAN"}</span>
          <div className="gen-gate-icon is-decision" aria-hidden="true"><i /></div>
          <strong>{riskStage === "ownership" ? "执行" : riskStage === "confirm" ? "确认" : "判断"}</strong>
        </div>
      </div>
    );
  }

  if (visual.kind === "agent-run") {
    return <TaskRunIllustration visual={visual} />;
  }

  if (visual.kind === "loop") {
    return <FeedbackIllustration visual={visual} />;
  }

  const scenario = inferScenarioVariant(teaching, visual, contentText, narration);

  if (scenario === "travel") {
    return (
      <div className="gen-visual gen-scenario-travel" aria-label={visual.detail}>
        <ContinuityNote visual={visual} />
        <div className="gen-travel-route">
          <span className="mono">WEEKEND PLAN</span>
          <strong>周末去另一座城市</strong>
          <div className="gen-travel-route-line" aria-hidden="true"><i /><i /><i /></div>
          <small>交通方便 · 预算有限 · 半天自由活动</small>
        </div>
        <div className="gen-travel-constraint is-budget">
          <span className="mono">CONSTRAINT 01</span>
          <strong>预算</strong>
          <small>不能超出可接受范围</small>
        </div>
        <div className="gen-travel-constraint is-transit">
          <span className="mono">CONSTRAINT 02</span>
          <strong>出行</strong>
          <small>时间和中转都要核验</small>
        </div>
        <div className="gen-travel-constraint is-free">
          <span className="mono">CONSTRAINT 03</span>
          <strong>体验</strong>
          <small>留出半天自由安排</small>
        </div>
      </div>
    );
  }

  if (scenario === "office") {
    return (
      <div className="gen-visual gen-scenario-office" aria-label={visual.detail}>
        <ContinuityNote visual={visual} />
        <div className="gen-office-source">
          <span className="mono">INBOX</span>
          <div className="gen-office-paper" aria-hidden="true"><i /><i /><i /><b /></div>
          <strong>会议资料</strong>
        </div>
        <div className="gen-office-flow" aria-hidden="true"><i /><i /><i /></div>
        <div className="gen-office-desk">
          <span className="mono">WORKFLOW</span>
          <div className="gen-office-timeline" aria-hidden="true">
            <i /><i /><i />
          </div>
          <div className="gen-office-tasks">
            {teaching.points.slice(0, 3).map((point, index) => (
              <div key={`${point.title}-${index}`}>
                <b>{String(index + 1).padStart(2, "0")}</b>
                <strong>{shortLabel(point.title, ["提取重点", "追踪事项", "安排进度"][index])}</strong>
              </div>
            ))}
          </div>
        </div>
        <div className="gen-office-result">
          <span className="mono">DELIVERABLE</span>
          <div className="gen-office-report" aria-hidden="true"><i /><i /><i /><i /></div>
          <strong>周报初稿</strong>
        </div>
      </div>
    );
  }

  if (scenario === "support") {
    return (
      <div className="gen-visual gen-scenario-support" aria-label={visual.detail}>
        <ContinuityNote visual={visual} />
        <div className="gen-support-queue">
          <span className="mono">QUEUE</span>
          <div className="gen-support-ticket is-active"><b>01</b><i /><i /></div>
          <div className="gen-support-ticket"><b>02</b><i /><i /></div>
          <div className="gen-support-ticket"><b>03</b><i /><i /></div>
          <strong>用户问题</strong>
        </div>
        <div className="gen-support-router">
          <span className="mono">ROUTE</span>
          <div className="gen-support-lens" aria-hidden="true"><i /></div>
          <strong>判断类型</strong>
        </div>
        <div className="gen-support-lanes">
          <div className="gen-support-lane is-fast">
            <span className="mono">FAST PATH</span>
            <b aria-hidden="true">✓</b>
            <strong>直接处理</strong>
          </div>
          <div className="gen-support-lane is-human">
            <span className="mono">ESCALATE</span>
            <b aria-hidden="true">→</b>
            <strong>转交人工</strong>
          </div>
        </div>
      </div>
    );
  }

  if (scenario === "development") {
    return (
      <div className="gen-visual gen-scenario-development" aria-label={visual.detail}>
        <ContinuityNote visual={visual} />
        <div className="gen-dev-request">
          <span className="mono">REQUEST</span>
          <div className="gen-dev-lines" aria-hidden="true"><i /><i /><i /></div>
          <strong>需求</strong>
        </div>
        <div className="gen-dev-code">
          <div className="gen-dev-windowbar" aria-hidden="true"><i /><i /><i /></div>
          <span className="mono">CODE</span>
          <div className="gen-dev-code-lines" aria-hidden="true"><i /><i /><i /><i /><i /></div>
          <strong>定位并修改</strong>
        </div>
        <div className="gen-dev-feedback" aria-hidden="true">
          <svg viewBox="0 0 170 110"><path d="M 20 55 C 20 18, 140 18, 140 55" /><path d="M 140 55 C 140 92, 20 92, 20 55" /></svg>
          <b>FEEDBACK</b>
        </div>
        <div className="gen-dev-test">
          <span className="mono">TEST</span>
          <div className="gen-dev-terminal" aria-hidden="true"><i /><i /><i /></div>
          <strong>运行测试</strong>
        </div>
      </div>
    );
  }

  // Generic workflow fallback for scenario content without a known domain.
  return (
    <div className="gen-visual gen-visual-scenario" aria-label={visual.detail}>
      <ContinuityNote visual={visual} />
      <div className="gen-scenario-input">
        <span className="mono">INPUT</span>
        <div className="gen-scenario-symbol is-input" aria-hidden="true" />
        <strong>输入</strong>
      </div>
      {teaching.points.map((point, index) => (
        <div className="gen-scenario-step" key={`${point.title}-${index}`}>
          <span>{String(index + 1).padStart(2, "0")}</span>
          <div className={`gen-scenario-symbol is-step-${index}`} aria-hidden="true" />
          <strong>{shortLabel(point.title, ["识别", "处理", "交付"][index])}</strong>
        </div>
      ))}
      <div className="gen-scenario-output">
        <span className="mono">RESULT</span>
        <div className="gen-scenario-symbol is-result" aria-hidden="true" />
        <strong>交付</strong>
      </div>
    </div>
  );
}

function TaskRunIllustration({ visual }: { visual: NormalizedVisual }) {
  const steps = visual.storyboard.actionSequence.slice(0, 4);
  return (
    <div className="gen-visual gen-visual-task-run" aria-label={visual.detail}>
      <ContinuityNote visual={visual} />
      <div className="gen-task-run-goal">
        <span className="mono">GOAL</span>
        <strong>{shortLabel(visual.storyboard.entities[0], "用户目标")}</strong>
      </div>
      <div className="gen-task-run-line" aria-hidden="true" />
      <div className="gen-task-run-steps">
        {steps.map((item, index) => (
          <div className={`gen-task-run-step is-${index}`} key={`${item}-${index}`}>
            <i aria-hidden="true" />
            <span className="mono">0{index + 1}</span>
            <strong>{shortLabel(item, ["识别", "拆分", "执行", "检查"][index])}</strong>
          </div>
        ))}
      </div>
      <div className="gen-task-run-result">
        <span className="mono">DELIVERABLE</span>
        <strong>{shortLabel(visual.storyboard.afterState, "可交付结果")}</strong>
      </div>
    </div>
  );
}

function FeedbackIllustration({ visual }: { visual: NormalizedVisual }) {
  const steps = visual.storyboard.actionSequence.slice(0, 3);
  return (
    <div className="gen-visual gen-visual-feedback" aria-label={visual.detail}>
      <ContinuityNote visual={visual} />
      <div className="gen-feedback-ring" aria-hidden="true"><i /><i /><i /></div>
      <div className="gen-feedback-core">
        <span className="mono">FEEDBACK</span>
        <strong>下一步会改变</strong>
      </div>
      {steps.map((item, index) => (
        <div className={`gen-feedback-node is-${index}`} key={`${item}-${index}`}>
          <span className="mono">0{index + 1}</span>
          <strong>{shortLabel(item, ["尝试", "观察", "调整"][index])}</strong>
        </div>
      ))}
    </div>
  );
}

function ContinuityNote({ visual }: { visual: NormalizedVisual }) {
  if (
    !visual.continuity.artifact ||
    visual.continuity.artifact === "一个可检查的结果" ||
    visual.continuity.artifactType === "none"
  ) {
    return null;
  }
  return (
    <div className={`gen-evidence-note gen-evidence-${visual.continuity.artifactType}`}>
      <i className="gen-evidence-glyph" aria-hidden="true" />
      <div>
        <span className="mono">{visual.continuity.artifactType}</span>
        <strong>{clampText(visual.continuity.artifact, 38)}</strong>
      </div>
    </div>
  );
}

function ArtifactIllustration({ visual }: { visual: NormalizedVisual }) {
  const evidence = visual.storyboard.evidence;
  const artifact = meaningfulArtifact(visual);

  return (
    <div
      className={`gen-visual gen-artifact-visual gen-artifact-${visual.continuity.artifactType}`}
      aria-label={`${visual.detail} ${artifact}`}
    >
      <ContinuityNote visual={visual} />
      <div className="gen-artifact-heading">
        <span className="mono">{visual.continuity.artifactType}</span>
        <strong>{clampText(artifact, 42)}</strong>
      </div>

      {visual.continuity.artifactType === "document" && (
        <div className="gen-document-sheet">
          <div className="gen-document-title">{shortLabel(evidence[0], "核心资料")}</div>
          <div className="gen-document-rule is-wide" />
          <div className="gen-document-rule" />
          <div className="gen-document-rule is-short" />
          <div className="gen-document-highlight">{shortLabel(evidence[1], "提取重点")}</div>
          <div className="gen-document-rule" />
          <div className="gen-document-rule is-medium" />
        </div>
      )}

      {visual.continuity.artifactType === "table" && (
        <div className="gen-table-sheet">
          <div className="gen-table-row is-head">
            <span>{shortLabel(evidence[0], "维度")}</span>
            <span>{shortLabel(evidence[1], "方案 A")}</span>
            <span>{shortLabel(evidence[2], "方案 B")}</span>
          </div>
          {["输入", "差异", "结论"].map((label, index) => (
            <div className="gen-table-row" key={label}>
              <strong>{label}</strong>
              <span>{shortLabel(evidence[index + 1], ["原始信息", "较轻", "可选"][index])}</span>
              <span>{shortLabel(evidence[index + 2], ["整理后", "较稳", "推荐"][index])}</span>
            </div>
          ))}
        </div>
      )}

      {visual.continuity.artifactType === "branch" && (
        <div className="gen-branch-map">
          <div className="gen-branch-start"><span className="mono">INPUT</span><strong>{shortLabel(evidence[0], "问题")}</strong></div>
          <div className="gen-branch-split" aria-hidden="true"><i /><i /></div>
          <div className="gen-branch-route is-top"><span className="mono">PATH A</span><strong>{shortLabel(evidence[1], "直接处理")}</strong></div>
          <div className="gen-branch-route is-bottom"><span className="mono">PATH B</span><strong>{shortLabel(evidence[2], "升级判断")}</strong></div>
        </div>
      )}

      {visual.continuity.artifactType === "timeline" && (
        <div className="gen-timeline-map">
          {evidence.slice(0, 4).map((item, index) => (
            <div className={`gen-timeline-item is-${index}`} key={`${item}-${index}`}>
              <i aria-hidden="true" />
              <span className="mono">0{index + 1}</span>
              <strong>{shortLabel(item, ["开始", "处理中", "已确认", "下一步"][index])}</strong>
            </div>
          ))}
        </div>
      )}

      {visual.continuity.artifactType === "metric" && (
        <div className="gen-metric-scene">
          <div className="gen-metric-number">{extractMetric(artifact, evidence)}</div>
          <div className="gen-metric-caption">{shortLabel(evidence[0], "可验证变化")}</div>
          <div className="gen-metric-bars" aria-hidden="true"><i /><i /><i /><i /></div>
        </div>
      )}

      {visual.continuity.artifactType === "quote" && (
        <blockquote className="gen-quote-scene">
          <span aria-hidden="true">“</span>
          <strong>{clampText(artifact, 110)}</strong>
          <small>{shortLabel(evidence[1], "关键判断")}</small>
        </blockquote>
      )}

      {visual.continuity.artifactType === "log" && (
        <div className="gen-log-scene">
          {evidence.slice(0, 4).map((item, index) => (
            <div className={`gen-log-line is-${index === evidence.length - 1 ? "result" : "event"}`} key={`${item}-${index}`}>
              <span className="mono">{index === evidence.length - 1 ? "OK" : ".."}</span>
              <strong>{shortLabel(item, ["开始运行", "收到反馈", "定位问题", "完成"][index])}</strong>
            </div>
          ))}
        </div>
      )}

      {visual.continuity.artifactType === "code" && (
        <div className="gen-code-scene">
          <div className="gen-code-topline"><span className="mono">SOURCE</span><b>● ● ●</b></div>
          {evidence.slice(0, 4).map((item, index) => (
            <div className="gen-code-line" key={`${item}-${index}`}><i>{String(index + 1).padStart(2, "0")}</i><span>{shortLabel(item, ["输入", "处理", "返回", "检查"][index])}</span></div>
          ))}
        </div>
      )}
    </div>
  );
}

function meaningfulArtifact(visual: NormalizedVisual) {
  const artifact = clean(visual.continuity.artifact);
  if (artifact && artifact !== "一个可检查的结果") return artifact;
  return visual.storyboard.evidence[0] || visual.storyboard.claim || "可检查的结果";
}

function extractMetric(artifact: string, evidence: string[]) {
  const match = `${artifact} ${evidence.join(" ")}`.match(/\d+(?:\.\d+)?\s*[%万亿千百十]?/u);
  return match?.[0]?.replace(/\s+/g, "") || "变化";
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
  context: { text: string; chapterId: string; step: number; caseName?: string },
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
    continuity: normalizeContinuity(spec?.continuity, context.text, context.caseName),
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

function shortLabel(value: unknown, fallback: string) {
  const label = clean(value);
  if (!label) return fallback;
  return label.length > 16 ? `${label.slice(0, 15)}…` : label;
}

function normalizeContinuity(
  value: GeneratedContinuity | undefined,
  contextText: string,
  projectCase?: string,
): Required<GeneratedContinuity> & { artifactType: GeneratedArtifactType } {
  return {
    case: clean(projectCase) || clean(value?.case) || inferCaseName(contextText),
    state: clean(value?.state) || "问题还没有被处理",
    change: clean(value?.change) || "画面把一个抽象问题推进到下一步",
    artifact: clean(value?.artifact) || "一个可检查的结果",
    artifactType: normalizeArtifactType(value?.artifactType, value?.artifact, contextText),
  };
}

function normalizeArtifactType(
  value: unknown,
  artifact: unknown,
  text: string,
): GeneratedArtifactType {
  const key = clean(value).toLowerCase();
  const allowed: GeneratedArtifactType[] = [
    "code", "document", "chat", "table", "branch", "timeline", "log", "metric", "quote", "none",
  ];
  if (allowed.includes(key as GeneratedArtifactType)) return key as GeneratedArtifactType;
  const artifactText = clean(artifact);
  if (/(代码|函数|配置|接口|api|脚本)/iu.test(artifactText)) return "code";
  if (/(日志|报错|trace|返回|运行结果|异常)/iu.test(artifactText)) return "log";
  if (/(分支|路径|判断|转交|转人工|分流|审批|边界)/u.test(artifactText)) return "branch";
  if (/(表格|预算|对比|字段|数据|列表|清单)/u.test(artifactText)) return "table";
  if (/(指标|比例|增长|评分|数量|金额|数字)/u.test(artifactText)) return "metric";
  if (/(文档|报告|资料|邮件|周报|文章|总结|纪要)/u.test(artifactText)) return "document";
  if (/(聊天|消息|对话|回复)/u.test(artifactText)) return "chat";
  if (/(进度|时间|追踪|历史|步骤|时间线)/u.test(artifactText)) return "timeline";
  if (/(定义|原话|结论|一句话)/u.test(artifactText)) return "quote";
  if (/(文档|报告|资料|邮件|周报|文章|总结|纪要|整理)/u.test(text)) return "document";
  const source = `${artifactText} ${text}`;
  if (/(代码|函数|配置|接口|api|脚本)/iu.test(source)) return "code";
  if (/(日志|报错|trace|返回|运行结果|异常)/iu.test(source)) return "log";
  if (/(分支|路径|判断|转交|转人工|分流|审批|边界)/u.test(source)) return "branch";
  if (/(聊天|消息|对话|回复|客服)/u.test(source)) return "chat";
  if (/(表格|预算|对比|字段|数据|列表|清单)/u.test(source)) return "table";
  if (/(进度|时间|会议|追踪|历史|步骤)/u.test(source)) return "timeline";
  if (/(指标|比例|增长|评分|数量|金额|数字)/u.test(source)) return "metric";
  if (/(文档|报告|资料|邮件|周报|文章|总结)/u.test(source)) return "document";
  if (/(定义|原话|结论|一句话)/u.test(source)) return "quote";
  if (/(表格|预算|对比|字段|数据|列表|清单)/u.test(text)) return "table";
  if (/(分支|路径|判断|转交|转人工|分流|审批|边界)/u.test(text)) return "branch";
  if (/(进度|时间|会议|追踪|历史|步骤|安排|截止)/u.test(text)) return "timeline";
  if (/(指标|比例|增长|评分|数量|金额|数字|转化率)/u.test(text)) return "metric";
  if (/(日志|报错|trace|返回|运行结果|异常|调试)/iu.test(text)) return "log";
  if (/(代码|函数|配置|接口|api|脚本)/iu.test(text)) return "code";
  if (/(定义|原话|结论|一句话|观点)/u.test(text)) return "quote";
  return "none";
}

function inferCaseName(text: string) {
  if (/(客服|订单|工单|分流)/u.test(text)) return "客服问题处理";
  if (/(开发|编码|代码|测试|报错)/u.test(text)) return "一次代码修改";
  if (/(办公|会议|邮件|周报|项目)/u.test(text)) return "一项办公任务";
  if (/(旅行|航班|酒店|行程)/u.test(text)) return "一次旅行规划";
  return "一个真实任务";
}

function inferScenarioVariant(
  teaching: TeachingContent,
  visual: NormalizedVisual,
  contentText: string,
  narration: string,
): "travel" | "office" | "support" | "development" | "generic" {
  const text = [
    contentText,
    narration,
    visual.subject,
    visual.detail,
    visual.storyboard.claim,
    visual.storyboard.entities.join(" "),
    visual.storyboard.actionSequence.join(" "),
    teaching.points.map((point) => `${point.title} ${point.detail}`).join(" "),
  ].join(" ");

  if (/(旅行|航班|酒店|行程|预算|中转|自由活动)/u.test(text)) return "travel";
  if (/(客服|订单|工单|查询|分流|用户问题|人工)/u.test(text)) return "support";
  if (/(开发|编码|代码|测试|需求|报错|修正|终端)/u.test(text)) return "development";
  if (/(办公|会议|邮件|周报|项目|整理|进度|资料)/u.test(text)) return "office";
  return "generic";
}

function inferRiskStage(text: string): "boundary" | "confirm" | "ownership" {
  if (/(高风险|确认|付款|删除|正式文件)/u.test(text)) return "confirm";
  if (/(人负责|方向|决策|分工|责任|分担|人和 Agent)/u.test(text)) return "ownership";
  return "boundary";
}
