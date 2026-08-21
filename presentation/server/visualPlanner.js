const KIND_ALIASES = new Map([
  ["dialogue", "chat"],
  ["chatbot", "chat"],
  ["chat", "chat"],
  ["workflow", "agent-run"],
  ["agent-run", "agent-run"],
  ["execution", "agent-run"],
  ["loop", "loop"],
  ["feedback-loop", "loop"],
  ["capabilities", "capabilities"],
  ["ability", "capabilities"],
  ["tool-chain", "tools"],
  ["tools", "tools"],
  ["memory", "memory"],
  ["progress-memory", "memory"],
  ["boundary", "risk"],
  ["risk", "risk"],
  ["default", "default"],
]);

const DEFAULT_LABELS = {
  chat: ["提出问题", "等待回复", "得到建议"],
  "agent-run": ["查信息", "比选项", "整理结果", "生成清单"],
  loop: ["拆任务", "看结果", "调下一步"],
  capabilities: ["理解目标", "规划任务", "调用工具", "检查结果"],
  tools: ["列框架", "搜资料", "汇总文稿"],
  memory: ["已完成", "进行中", "还缺什么"],
  risk: ["高风险动作", "越过边界", "人工确认"],
  default: ["重点", "变化", "结果"],
};

const REQUIRED_LABEL_COUNTS = {
  chat: 3,
  "agent-run": 4,
  loop: 3,
  capabilities: 4,
  tools: 3,
  memory: 3,
  risk: 3,
  default: 3,
};

const ACTION_BY_KIND = {
  chat: "simulate-message",
  "agent-run": "advance-task-chain",
  loop: "draw-feedback-loop",
  capabilities: "reveal-capability-map",
  tools: "connect-tool-chain",
  memory: "check-progress-stack",
  risk: "show-human-boundary",
  default: "focus-and-highlight",
};

export function attachVisualPlans(project) {
  const caseName = inferCaseName(
    [project?.title, project?.content, ...(project?.chapters || []).map((chapter) =>
      [chapter?.title, ...(chapter?.steps || [])].join(" "),
    )].join(" "),
  );
  return {
    ...project,
    chapters: (project.chapters || []).map((chapter) => ({
      ...chapter,
      visuals: buildChapterVisuals(chapter, caseName),
    })),
  };
}

export function buildChapterVisuals(chapter, caseName = "") {
  const steps = Array.isArray(chapter?.steps) ? chapter.steps : [];
  const visuals = Array.isArray(chapter?.visuals) ? chapter.visuals : [];
  const narrations = Array.isArray(chapter?.narrations) ? chapter.narrations : [];
  return steps.map((step, index) =>
    normalizeVisualSpec(visuals[index], {
      chapterId: chapter?.id,
      chapterTitle: chapter?.title,
      stepText: step,
      narrationText: narrations[index],
      stepIndex: index,
      caseName,
    }),
  );
}

export function normalizeVisualSpec(spec, context = {}) {
  const inferred = inferVisualSpec(context);
  const kind = normalizeKind(spec?.kind || spec?.scene || inferred.kind);
  const labels = completeLabels(
    kind,
    normalizeLabels(spec?.labels || spec?.nodes || spec?.beats, context.stepText),
  );
  const base = {
    kind,
    action: clean(spec?.action) || ACTION_BY_KIND[kind] || inferred.action,
    subject: clean(spec?.subject) || inferred.subject,
    detail: clean(spec?.detail) || inferred.detail,
    labels,
    continuity: normalizeContinuity(spec?.continuity, { ...context, kind }),
  };
  return {
    ...base,
    storyboard: normalizeStoryboard(spec?.storyboard || spec, {
      ...context,
      ...base,
    }),
  };
}

function normalizeContinuity(value, context) {
  const text = clean(context.stepText) || `${context.chapterTitle || ""}`;
  const narrationText = clean(context.narrationText);
  const inferredArtifactType =
    clean(value?.artifactType) === "none" && context.kind === "tools"
      ? normalizeArtifactType(undefined, value?.artifact, `${text} ${narrationText}`)
      : undefined;
  return {
    case: clean(context.caseName) || clean(value?.case) || inferCaseName(text),
    state: clean(value?.state) || "问题还没有被处理",
    change: clean(value?.change) || "画面把问题推进到下一步",
    artifact: clean(value?.artifact) || "一个可检查的结果",
    artifactType:
      inferredArtifactType && inferredArtifactType !== "none"
        ? inferredArtifactType
        : normalizeArtifactType(value?.artifactType, value?.artifact, text),
  };
}

function normalizeArtifactType(value, artifact, text) {
  const key = clean(value).toLowerCase();
  const allowed = new Set([
    "code", "document", "chat", "table", "branch", "timeline", "log", "metric", "quote", "none",
  ]);
  if (allowed.has(key)) return key;
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

function inferCaseName(text) {
  if (/(贯穿案例|主线案例)[^。！？]{0,24}(旅行|航班|酒店|行程)/u.test(text)) {
    return "一次旅行规划";
  }
  const candidates = [
    ["一次旅行规划", /(旅行|航班|酒店|行程|预算)/gu],
    ["客服问题处理", /(客服|订单|工单|分流|退款)/gu],
    ["一次代码修改", /(开发|编码|代码|测试|报错|修正)/gu],
    ["一项办公任务", /(办公|会议|邮件|周报|项目)/gu],
  ];
  const ranked = candidates
    .map(([name, pattern]) => [name, (text.match(pattern) || []).length])
    .sort((a, b) => b[1] - a[1]);
  if (ranked[0][1] > 0) return ranked[0][0];
  return "一个真实任务";
}

function inferVisualSpec({ chapterId = "", chapterTitle = "", stepText = "", stepIndex = 0 }) {
  const text = `${chapterTitle} ${stepText}`;
  const kind = inferKind(text, chapterId, stepIndex);
  return {
    kind,
    action: ACTION_BY_KIND[kind] || ACTION_BY_KIND.default,
    subject: inferSubject(text, kind),
    detail: inferDetail(kind),
    labels: completeLabels(kind, inferLabels(text, kind)),
  };
}

function normalizeStoryboard(value, context) {
  const inferred = inferStoryboard(context);
  const requestedSceneType = normalizeSceneType(clean(value?.sceneType) || inferred.sceneType);
  const sceneType =
    requestedSceneType === "workflow" && inferred.sceneType !== "workflow"
      ? inferred.sceneType
      : requestedSceneType;
  const actionSequence = completeSequence(
    normalizeStringArray(value?.actionSequence),
    inferred.actionSequence,
    sceneType,
  );
  return {
    sceneType,
    claim: clean(value?.claim) || inferred.claim,
    entities: completeEntities(normalizeStringArray(value?.entities), inferred.entities),
    beforeState: clean(value?.beforeState) || inferred.beforeState,
    actionSequence,
    afterState: clean(value?.afterState) || inferred.afterState,
    evidence: completeEvidence(
      isGenericEvidence(normalizeStringArray(value?.evidence))
        ? []
        : normalizeStringArray(value?.evidence),
      inferred.evidence,
      actionSequence,
    ),
    visualMetaphor: clean(value?.visualMetaphor) || inferred.visualMetaphor,
  };
}

function isGenericEvidence(evidence) {
  if (!Array.isArray(evidence) || evidence.length === 0) return true;
  const generic = new Set([
    "输入",
    "过程",
    "结果",
    "工具请求",
    "返回片段",
    "汇总卡片",
    "列出子任务",
    "识别意图",
    "一个可检查的结果",
  ]);
  return evidence.every((item) => generic.has(clean(item)));
}

function inferStoryboard(context) {
  const stepText = clean(context.stepText);
  const text = `${context.chapterTitle || ""} ${stepText}`;
  const sceneType = inferSceneType(stepText || text, context);

  if (sceneType === "contrast") {
    return {
      sceneType,
      claim: "同一个问题，聊天机器人停在回答，Agent 会继续执行。",
      entities: ["用户目标", "聊天机器人", "Agent"],
      beforeState: "用户只提出一个目标，还没有任何实际进展。",
      actionSequence: ["聊天机器人生成建议", "Agent 拆成任务", "Agent 继续查找和整理"],
      afterState: "画面从一段回复变成一条正在推进的任务链。",
      evidence: ["回复", "任务拆分", "执行进度"],
      visualMetaphor: "split-screen comparison",
    };
  }

  if (sceneType === "capability-loop") {
    return {
      sceneType,
      claim: "Agent 的核心不是某一个按钮，而是四个能力连续形成闭环。",
      entities: ["目标", "规划器", "工具", "检查器"],
      beforeState: "自然语言目标刚进入系统。",
      actionSequence: ["理解目标", "规划任务", "调用工具", "检查结果"],
      afterState: "检查结果会反馈到下一轮规划。",
      evidence: ["目标被结构化", "任务被拆分", "工具返回结果", "缺口被复核"],
      visualMetaphor: "closed-loop operating system",
    };
  }

  if (sceneType === "tool-call") {
    const teachingText = `${text} ${clean(context.narrationText)}`;
    return {
      sceneType,
      claim: "Agent 会把计划转成真实工具调用，而不是只给一段话。",
      entities: ["计划", "搜索", "文档", "结果"],
      beforeState: "屏幕上只有一个待完成计划。",
      actionSequence: ["列出子任务", "调用工具", "汇总结果"],
      afterState: "计划变成带来源和结果的工作产物。",
      evidence: inferToolEvidence(teachingText),
      visualMetaphor: "command center",
    };
  }

  if (sceneType === "memory") {
    return {
      sceneType,
      claim: "Agent 会带着进度继续工作，不需要每次从零开始。",
      entities: ["已完成", "进行中", "待补充"],
      beforeState: "任务历史散落在上下文里。",
      actionSequence: ["读取进度", "标记当前步骤", "留下下一步"],
      afterState: "下一次打开时能接着推进。",
      evidence: ["完成记录", "当前状态", "下一步提示"],
      visualMetaphor: "progress ledger",
    };
  }

  if (sceneType === "risk-boundary") {
    return {
      sceneType,
      claim: "越能行动，越需要把高风险动作交回给人确认。",
      entities: ["Agent", "风险动作", "人工确认"],
      beforeState: "Agent 准备执行一个会产生后果的动作。",
      actionSequence: ["识别风险", "暂停执行", "请求确认"],
      afterState: "人负责方向和决策，Agent 负责执行。",
      evidence: ["边界线", "暂停状态", "确认卡片"],
      visualMetaphor: "approval gate",
    };
  }

  if (sceneType === "scenario") {
    const scenario = inferScenario(text);
    return {
      sceneType,
      claim: `${scenario.name}场景里，Agent 的价值是把输入变成可交付结果。`,
      entities: scenario.entities,
      beforeState: scenario.beforeState,
      actionSequence: scenario.actionSequence,
      afterState: scenario.afterState,
      evidence: scenario.evidence,
      visualMetaphor: scenario.metaphor,
    };
  }

  return {
    sceneType: "workflow",
    claim: clean(context.stepText) || "这一页解释一个从输入到结果的过程。",
    entities: completeLabels(context.kind || "default", normalizeLabels([], context.stepText)),
    beforeState: "观众先看到一个未处理的问题。",
    actionSequence: completeLabels(context.kind || "default", normalizeLabels([], context.stepText)),
    afterState: "画面收束到一个清晰结论。",
    evidence: ["输入", "过程", "结果"],
    visualMetaphor: "process board",
  };
}

function inferToolEvidence(text) {
  if (/(航班|酒店|行程|余票|中转|住宿)/u.test(text)) {
    return ["航班时间、价格和余票", "住宿位置、价格和取消规则", "行程选择依据"];
  }
  if (/(会议纪要|负责人|截止时间|待办|周报)/u.test(text)) {
    return ["决定事项", "负责人和截止时间", "尚未更新的项目"];
  }
  if (/(资料|来源|报告|文章|文档)/u.test(text)) {
    return ["来源资料", "提取出的重点", "可执行的整理结果"];
  }
  return ["工具请求", "返回片段", "汇总卡片"];
}

function inferSceneType(text, context) {
  if (/(区别|不是|而是|相比|对比|聊天机器人.*Agent|Agent.*聊天机器人)/u.test(text)) return "contrast";
  if (/(四个|能力|理解目标|规划任务|检查结果|闭环)/u.test(text)) return "capability-loop";
  if (/(工具|搜索|资料|文档|代码|测试|报告|调用|API|框架|市场)/u.test(text)) return "tool-call";
  if (/(记住|进度|已经|还差|从零|记录)/u.test(text)) return "memory";
  if (/(风险|边界|确认|付款|删除|正式文件|不合适|人工|负责|责任|决策|人和 Agent)/u.test(text)) return "risk-boundary";
  if (/(办公|客服|开发|旅行|行程|会议|邮件|工单|编码|修正|整理|追踪|分流)/u.test(text)) return "scenario";
  if (context.kind === "chat") return "contrast";
  if (context.kind === "capabilities") return "capability-loop";
  if (context.kind === "tools") return "tool-call";
  if (context.kind === "memory") return "memory";
  if (context.kind === "risk") return "risk-boundary";
  return "workflow";
}

function inferScenario(text) {
  if (/(客服|查询|分流|工单)/u.test(text)) {
    return {
      name: "客服",
      entities: ["用户问题", "知识库", "工单分流"],
      beforeState: "用户问题排成队，客服需要逐条判断。",
      actionSequence: ["识别意图", "查询资料", "分流工单"],
      afterState: "简单问题直接回复，复杂问题交给对应团队。",
      evidence: ["问题标签", "知识库命中", "工单队列"],
      metaphor: "support routing desk",
    };
  }
  if (/(开发|编码|代码|修正|测试)/u.test(text)) {
    return {
      name: "开发",
      entities: ["需求", "代码", "测试"],
      beforeState: "需求还停留在一句描述。",
      actionSequence: ["读需求", "改代码", "运行检查"],
      afterState: "代码变更和测试结果一起呈现。",
      evidence: ["文件变更", "终端日志", "测试状态"],
      metaphor: "developer workspace",
    };
  }
  if (/(办公|会议|邮件|整理|追踪)/u.test(text)) {
    return {
      name: "办公",
      entities: ["资料", "待办", "进度"],
      beforeState: "资料、邮件和待办散在不同地方。",
      actionSequence: ["收集资料", "整理清单", "追踪进度"],
      afterState: "零散信息变成可执行的工作台。",
      evidence: ["资料卡片", "待办列表", "进度栏"],
      metaphor: "office operations board",
    };
  }
  return {
    name: "业务",
    entities: ["输入", "处理", "交付"],
    beforeState: "业务输入还没有被整理。",
    actionSequence: ["识别需求", "执行步骤", "交付结果"],
    afterState: "输入变成可检查的结果。",
    evidence: ["输入卡", "过程线", "结果卡"],
    metaphor: "scenario board",
  };
}

function inferKind(text, chapterId, stepIndex) {
  if (/(风险|边界|确认|付款|删除|正式文件|不合适|人工)/u.test(text)) return "risk";
  if (/(记住|进度|已经|还差|从零|记录)/u.test(text)) return "memory";
  if (/(四个|能力|理解目标|规划任务|检查结果|闭环)/u.test(text)) return "capabilities";
  if (/(工具|搜索|资料|文档|代码|测试|报告|框架|市场|调用)/u.test(text)) return "tools";
  if (/(反馈|循环|调整|下一步|结果|复核)/u.test(text)) return "loop";
  if (/(继续|往下|查航班|比酒店|预算|待办|执行|推进|自动化)/u.test(text)) {
    return "agent-run";
  }
  if (/(聊天|机器人|回复|建议|对话|客服|问答)/u.test(text)) return "chat";
  if (chapterId === "difference") {
    return stepIndex === 0 ? "chat" : stepIndex === 1 ? "agent-run" : "loop";
  }
  return "default";
}

function inferSubject(text, kind) {
  if (kind === "chat") return "聊天机器人停在回答";
  if (kind === "agent-run") return "Agent 继续推进任务";
  if (kind === "loop") return "任务反馈循环";
  if (kind === "capabilities") return "Agent";
  if (kind === "tools") return "工具调用链";
  if (kind === "memory") return "进度记忆";
  if (kind === "risk") return "人工确认边界";
  return extractPhrases(text, "核心重点")[0] || "核心重点";
}

function inferDetail(kind) {
  if (kind === "chat") return "用消息气泡表现：提出问题、等待回复、得到建议，然后停住。";
  if (kind === "agent-run") return "用横向任务链表现 Agent 不停留在回答，而是继续执行。";
  if (kind === "loop") return "用闭环箭头表现：拆任务、看结果、再调整下一步。";
  if (kind === "capabilities") {
    return "用四个能力节点围绕 Agent，并用连线表现理解、规划、调用、检查形成闭环。";
  }
  if (kind === "tools") return "用文档到工具节点的连线表现调用过程。";
  if (kind === "memory") return "用任务栏表现已经做过什么、正在做什么、还缺什么。";
  if (kind === "risk") return "用边界圆和确认卡表现高风险动作需要人确认。";
  return "用焦点卡和关键词突出这一页的核心概念。";
}

function inferLabels(text, kind) {
  const fromText = extractPhrases(text, "");
  if (fromText.length >= REQUIRED_LABEL_COUNTS.default && kind === "default") {
    return fromText.slice(0, REQUIRED_LABEL_COUNTS.default);
  }
  return DEFAULT_LABELS[kind] || DEFAULT_LABELS.default;
}

function normalizeKind(value) {
  const key = clean(value).toLowerCase();
  return KIND_ALIASES.get(key) || "default";
}

function normalizeSceneType(value) {
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
    return key;
  }
  return "workflow";
}

function normalizeLabels(value, fallbackText) {
  const raw = Array.isArray(value) ? value : [];
  const labels = raw.map(clean).filter(Boolean);
  if (labels.length) return labels;
  return extractPhrases(fallbackText, "");
}

function normalizeStringArray(value) {
  return Array.isArray(value) ? value.map(clean).filter(Boolean).slice(0, 6) : [];
}

function completeLabels(kind, labels) {
  const defaults = DEFAULT_LABELS[kind] || DEFAULT_LABELS.default;
  const required = REQUIRED_LABEL_COUNTS[kind] || REQUIRED_LABEL_COUNTS.default;
  const combined = uniqueLabels(labels);

  if (kind === "capabilities") {
    return defaults.slice(0, required);
  }

  for (const label of defaults) {
    if (combined.length >= required) break;
    if (!combined.includes(label)) combined.push(label);
  }

  return combined.slice(0, Math.max(required, Math.min(5, combined.length)));
}

function completeEntities(entities, inferred) {
  const combined = uniqueLabels([...entities, ...inferred]);
  return combined.slice(0, 4);
}

function completeSequence(sequence, inferred, sceneType) {
  const minimum = sceneType === "capability-loop" ? 4 : 3;
  const combined = uniqueLabels([...sequence, ...inferred]);
  return combined.slice(0, Math.max(minimum, Math.min(5, combined.length)));
}

function completeEvidence(evidence, inferred, actionSequence) {
  const combined = uniqueLabels([...evidence, ...inferred, ...actionSequence]);
  return combined.slice(0, 4);
}

function uniqueLabels(labels) {
  const seen = new Set();
  const result = [];
  for (const label of labels) {
    const cleanLabel = clean(label);
    if (!cleanLabel || seen.has(cleanLabel)) continue;
    seen.add(cleanLabel);
    result.push(cleanLabel);
  }
  return result;
}

function extractPhrases(text, fallback) {
  const matches = String(text || "").match(/[\u4e00-\u9fa5A-Za-z0-9]+/g) || [];
  const phrases = matches
    .map((part) => (part.length > 10 ? part.slice(0, 10) : part))
    .filter((part) => part.length >= 2)
    .slice(0, 4);
  if (!phrases.length && fallback) phrases.push(fallback);
  return phrases;
}

function clean(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}
