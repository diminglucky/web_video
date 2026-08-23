# Web Video Studio 商业级内容驱动视频设计方案

## 1. 方案结论

当前产品的问题不是缺少一个更强的 CSS 模板，也不是单独安装一个 Skill 就能解决。真正的问题是生成链路把不同知识内容压缩成了同一种“标题 + 若干对象 + 通用关系图”的画面。

因此本项目要从“自动生成页面”升级为“内容驱动的解释视频系统”：

```text
用户素材
  -> 知识结构
  -> 教学叙事
  -> 每屏要证明的关系
  -> 场景类型与状态变化
  -> 专用场景渲染器
  -> 连续播放、口播、音频、视频导出
  -> 内容与视觉质量验收
```

Skill 可以固化提示词、设计原则和验收流程，但不能代替场景数据模型、渲染器和项目状态管理。建议继续保留 `web-video-presentation` Skill，并把它定位为“生成规范和质量门禁”；产品本身负责真正的生成、编辑、播放和导出。

### 1.1 审核修订结论

本方案经过技术审核后增加了七项硬约束：动画必须有可导出的时间线；多阶段生成必须异步、可恢复；项目必须用版本标识绑定文稿、分镜、音频和视频；单屏编辑必须有独立 API；证据必须可追溯到原始素材；ScenePlan 必须有运行时校验；没有真实素材时必须有明确的视觉降级策略。没有完成这些约束前，不进入大规模 renderer 开发。

## 2. 产品定位

### 2.1 面向用户

用户可能提供一篇文章、一段口播稿、一个复杂知识点或一个产品说明。用户不需要先懂分镜和动画，但需要能够：

- 先看到完整、可修改的口播稿。
- 知道每一屏想讲清楚什么，而不是只看到装饰性画面。
- 修改口播后重新生成与口播匹配的画面。
- 在同一个项目中保留历史版本、音频和视频产物。
- 看到大模型、音频 provider 和导出任务的真实状态。

### 2.2 产品承诺

每个画面都必须回答一个问题：

> 这一屏在帮助观众理解什么关系、变化或证据？

如果一个画面只能回答“这里有几个好看的卡片”，就不应该进入最终视频。

### 2.3 非目标

- 不追求把所有内容自动做成复杂的三维动画。
- 不在没有真实数据时伪造图表、百分比和代码。
- 不用大量通用入场动画掩盖口播内容不足。
- 不要求历史项目立即迁移到新场景系统。

## 3. 现状问题诊断

### 3.1 生成层问题

现有 LLM 已经返回 `contentObjects`、`relations`、`motion` 和 `layout`，但这些字段仍然主要服务于一个通用语义舞台。模型没有被强制要求回答“本屏相对于上一屏新增了什么证据”，渲染器也没有根据内容类型做足够大的结构分化。

### 3.2 渲染层问题

`GeneratedChapter.tsx` 当前包含多种视觉分支，但语义对象较多时会优先进入通用语义渲染，导致聊天、机制解释、工作流和风险边界在视觉上仍可能像同一套模板。场景类型是数据，却没有完全成为组件边界。

### 3.3 口播层问题

口播质量门禁已经检查长度、重复、例子、机制和边界，但还没有把“本屏新增信息”和“上一屏已讲过的信息”做成结构化校验。因此模型可能用更长的句子重复同一个结论。

### 3.4 项目层问题

项目、草稿、分镜、音频和视频已经持久化，但需要明确版本和产物的关系：修改口播后，旧音频和旧视频必须失效；重新生成画面后，必须能看出使用的是哪一版文稿和哪一次 LLM 配置。

## 4. 总体架构

### 4.1 六层架构

#### A. Source Layer：素材层

保存用户原始输入，不覆盖、不丢失。

```ts
interface SourceMaterial {
  id: string;
  title: string;
  rawContent: string;
  sourceType: "article" | "script" | "outline" | "brief";
  language: "zh-CN" | "en-US" | string;
  constraints?: {
    targetDurationSec?: number;
    audience?: string;
    tone?: string;
    depth?: "overview" | "standard" | "deep";
  };
}
```

原始素材先被切成稳定的 `chunkId`。后续证据引用以 chunk 为主、字符位置为辅；素材清洗、重新分段或重新生成文稿不能改变已保存版本中的 chunk 内容。

#### B. Knowledge Layer：知识结构层

从素材中提取能支撑教学的事实，不直接决定 CSS 或动画。

```ts
interface KnowledgeMap {
  concepts: KnowledgeEntity[];
  claims: KnowledgeClaim[];
  examples: KnowledgeExample[];
  mechanisms: MechanismStep[];
  boundaries: Boundary[];
  evidence: Evidence[];
  caseStudy?: CaseStudy;
}

interface KnowledgeEntity {
  id: string;
  label: string;
  definition?: string;
  sourceEvidenceIds: string[];
}

interface MechanismStep {
  id: string;
  order: number;
  action: string;
  causeIds: string[];
  resultIds: string[];
}

interface Boundary {
  id: string;
  condition: string;
  allowedAction: string;
  humanDecisionRequired: boolean;
  evidenceIds: string[];
}

interface CaseStudy {
  id: string;
  subject: string;
  initialState: string;
  stateChanges: string[];
  evidenceIds: string[];
}

interface KnowledgeClaim {
  id: string;
  statement: string;
  reason?: string;
  supportedBy: string[];
  prerequisiteIds: string[];
}
```

硬规则：没有来源事实就不能生成具体数字；没有代码就不能生成代码面板；没有真实对比条件就不能生成“左右两边看起来不同”的伪对比。

证据必须可追溯，不能只靠提示词约束模型：

```ts
interface SourceSpan {
  materialId: string;
  chunkId: string;
  start?: number;
  end?: number;
  quote: string;
}

interface Evidence {
  id: string;
  claim: string;
  sourceRefs: SourceSpan[];
  kind: "source" | "model-inference" | "user-added";
  confidence: number;
  userNote?: string;
}
```

`source` 表示可以在用户原文中定位，`model-inference` 表示模型根据一个或多个原文片段归纳，`user-added` 表示用户在编辑器中补充。数字、代码、引用和图表默认必须绑定 `source` 或 `user-added` 证据；`model-inference` 只能作为解释性内容，不能单独支撑精确事实。`source` 和 `model-inference` 必须至少有一个 `sourceRefs`，`user-added` 必须有 `userNote`。

#### C. Teaching Layer：教学叙事层

把知识结构变成观众可以跟上的讲解顺序。这里决定口播，不决定具体 CSS。

```ts
interface TeachingPlan {
  audience: string;
  learningOutcome: string;
  caseStudy?: CaseStudy;
  chapters: TeachingChapter[];
}

interface TeachingChapter {
  id: string;
  title: string;
  goal: string;
  beats: TeachingBeat[];
}

interface TeachingBeat {
  id: string;
  narration: string;
  screenLine: string;
  purpose: "hook" | "question" | "definition" | "mechanism" | "example" |
    "comparison" | "boundary" | "summary";
  newClaimIds: string[];
  prerequisiteBeatIds: string[];
  exampleIds: string[];
  evidenceIds: string[];
  audienceQuestion: string;
}
```

一屏只能有一个主要教学目的。口播要解释画面背后的原因，不把屏幕短句原样读一遍。

#### D. Scene Layer：分镜层

根据教学目的和知识关系选择场景类型。这里是解决“每一页都一样”的核心层。

```ts
interface ScenePlan {
  id: string;
  type: SceneType;
  teachingBeatId: string;
  intent: string;
  claim: string;
  evidence: EvidenceRef[];
  startState: SceneState;
  endState: SceneState;
  actors: SceneActor[];
  actions: SceneAction[];
  timeline: SceneTimeline;
  continuity: ContinuityPlan;
  visualDensity: "quiet" | "standard" | "dense";
  fallback?: "document" | "spatial" | "timeline" | "minimal";
}
```

Scene Layer 不能只输出 `layout: "sequence"`。必须输出具有业务意义的 `type`、状态变化、证据和动作。

### 4.2 ScenePlan 最小契约

以下字段是进入 renderer 前的最小运行时契约：

```ts
type SceneType =
  | "chat" | "workflow" | "comparison" | "case-study" | "mechanism"
  | "document" | "data" | "boundary" | "summary";

interface SceneState {
  id: string;
  label: string;
  values: Record<string, string | number | boolean>;
}

interface SceneActor {
  id: string;
  role: "person" | "system" | "document" | "tool" | "data" | "decision";
  label: string;
  assetId?: string;
}

interface EvidenceRef {
  evidenceId: string;
  claim: string;
  displayMode: "primary" | "supporting" | "context";
}

interface ContinuityPlan {
  caseId?: string;
  previousSceneId?: string;
  reason?: string;
  preservedActorIds: string[];
  changedActorIds: string[];
}
```

校验规则：`teachingBeatId`、`claim`、`startState`、`endState`、`actions` 必须存在；所有 action 的 `targetId` 必须引用 `actors` 或状态字段；所有 `EvidenceRef.evidenceId` 必须能在 `KnowledgeMap.evidence` 中找到；连续使用同一 `type` 时必须填写 `continuity.reason`。校验失败时进入可解释的 fallback，不允许 silently normalize 成通用卡片。

#### E. Renderer Layer：场景渲染层

每个场景类型由独立 renderer 负责布局、动作和响应式规则。renderer 只消费经过校验的 ScenePlan，不自行猜测知识内容。

```tsx
function SceneRenderer({ plan, step, timeMs }: Props) {
  switch (plan.type) {
    case "chat": return <ChatScene plan={plan} step={step} timeMs={timeMs} />;
    case "workflow": return <WorkflowScene plan={plan} step={step} timeMs={timeMs} />;
    case "comparison": return <ComparisonScene plan={plan} step={step} timeMs={timeMs} />;
    case "case-study": return <CaseStudyScene plan={plan} step={step} timeMs={timeMs} />;
    case "mechanism": return <MechanismScene plan={plan} step={step} timeMs={timeMs} />;
    case "document": return <DocumentScene plan={plan} step={step} timeMs={timeMs} />;
    case "data": return <DataScene plan={plan} step={step} timeMs={timeMs} />;
    case "boundary": return <BoundaryScene plan={plan} step={step} timeMs={timeMs} />;
    case "summary": return <SummaryScene plan={plan} step={step} timeMs={timeMs} />;
    default: return <FallbackScene plan={plan} step={step} timeMs={timeMs} />;
  }
}
```

#### F. Runtime Layer：播放与导出层

统一处理点击推进、自动播放、音频同步、录屏截图、MP4 导出和错误状态。Renderer 不直接管理定时器，不直接读 API，不直接写项目文件。

## 5. 场景系统设计

### 5.1 场景类型与适用内容

| 场景 | 适合回答的问题 | 视觉主体 | 动作核心 |
| --- | --- | --- | --- |
| `chat` | 对话系统和普通聊天有什么不同？ | 两个真实角色、消息、等待状态 | 提问、回复、触发下一步 |
| `workflow` | 一个任务是怎样被推进的？ | 具体任务、状态节点、产物 | 任务从待处理变为完成 |
| `comparison` | 两种方法在关键处差在哪里？ | 同一问题的两条路径 | 分叉、不同选择、不同结果 |
| `case-study` | 这个知识点在真实案例中怎样工作？ | 全片持续的案例对象 | 案例状态跨屏连续变化 |
| `mechanism` | 内部为什么会产生这个结果？ | 分层结构、因果链、内部组件 | 剥开、传递、组合、反馈 |
| `document` | 结果具体长什么样？ | 邮件、报告、表格、工单、文档 | 填写、批注、修改、生成 |
| `data` | 证据和趋势是什么？ | 来源数据、坐标轴、指标 | 增长、下降、筛选、聚焦 |
| `boundary` | 什么时候必须停下来让人判断？ | 风险动作、审批点、上下文 | 暂停、阻断、人工确认 |
| `summary` | 前面几步如何形成一个可复述框架？ | 关键对象的重新连接 | 汇聚、压缩、回看 |

### 5.2 场景不能只靠关键词选择

LLM 可以提出候选场景，但最终选择需要由规则校验：

1. 教学目的为 `example`，且有具体对象或产物，优先 `case-study` 或 `document`。
2. 教学目的为 `mechanism`，且存在因果链或内部步骤，使用 `mechanism`，禁止普通卡片网格。
3. 存在明确的“如果……否则……”或人工审批条件，使用 `boundary`。
4. 存在两种方案和不同结果，使用 `comparison`。
5. 素材包含真实数字和来源，才允许使用 `data`。
6. 单纯定义概念时使用安静的 `summary` 或 `mechanism` 开场，不强行制造流程图。
7. 连续两屏不能使用相同场景类型，除非后一屏明确推进同一个案例状态，并通过 `continuity.reason` 说明原因。

### 5.3 专用 renderer 的最低要求

每个 renderer 必须拥有：

- 自己的 DOM 结构和 CSS 前缀。
- 明确的开始状态、动作状态和结束状态。
- 与 scene action 一一对应的动画，不使用无意义的统一 stagger。
- 内容过长时的降级布局，而不是溢出或重叠。
- `prefers-reduced-motion` 下的静态状态。
- 桌面 16:9 和窄屏预览两套可读布局。
- 可被 Playwright 查询的稳定标记，例如 `data-scene-type`、`data-object-id`。

## 6. 内容驱动动画规则

### 6.1 动画先表达关系，再表达情绪

动画动作必须来自知识关系：

| 内容关系 | 推荐动作 |
| --- | --- |
| 先后顺序 | 节点按实际顺序连接，当前节点推进 |
| 因果关系 | 原因发出线索，结果被触发或显现 |
| 对比关系 | 同一对象复制成两条路径，再产生不同结果 |
| 内部机制 | 外层结构被移开，内部层逐层出现 |
| 状态变化 | 同一个对象更新字段，而不是重新出现一张卡 |
| 风险边界 | 动作在边界处暂停，确认点获得焦点 |
| 文档生成 | 空白文档逐段填充，最终产物保留上下文 |
| 对话 | 消息按角色和时间顺序出现，等待不是装饰 |

### 6.2 每屏动作时间线与 MP4 导出

一个教学节拍对应一个场景，但一个场景不等于一张静态截图。每个 ScenePlan 必须输出可执行的逻辑时间线，运行时映射到网页预览和音频时间：

```ts
interface SceneAction {
  id: string;
  targetId: string;
  verb: "enter" | "move" | "update" | "split" | "connect" | "pause" |
    "approve" | "reject" | "reveal" | "focus";
  reason: string;
  startMs: number;
  endMs: number;
  fromValue?: string | number | boolean;
  toValue?: string | number | boolean;
  from?: string;
  to?: string;
  easing?: "linear" | "ease-in" | "ease-out" | "ease-in-out";
}
```

`reason` 是硬字段。没有理由的 `pulse`、`float`、`fade-in` 不进入新场景协议。

ScenePlan 还必须包含：

```ts
interface SceneTimeline {
  durationMs: number;
  keyframes: Array<{
    atMs: number;
    state: string;
    visibleActorIds: string[];
    completedActionIds: string[];
  }>;
}
```

时间线约束：`durationMs >= 1200`；`keyframes` 必须包含 `atMs: 0` 和 `atMs: durationMs`；时间必须递增且不超过 `durationMs`；每个 action 必须满足 `0 <= startMs < endMs <= durationMs`；每个 `completedActionIds` 必须引用 `actions` 中已存在的 action。renderer 要提供纯函数式 `getSceneState(plan, timeMs)`，使浏览器预览、截图测试和 MP4 导出使用同一份状态计算逻辑。

导出流程统一为：

```text
ScenePlan + SceneTimeline
  -> renderStep + renderTime
  -> Playwright 在指定时间冻结页面
  -> 按 FPS 采集多个时间帧
  -> FFmpeg 拼接帧和音频
```

网页预览的点击推进只改变当前教学节拍；节拍内部的自动动作由 `renderTime` 驱动。MP4 导出不能使用“每个 step 一张截图”的旧模式，也不能在截图时关闭动画后只保存最终状态。导出器必须支持 `?renderStep=<n>&renderTime=<ms>`，并在每个关键帧和关键帧之间按 `RENDER_FPS` 采样。若某场景没有可执行时间线，只能使用静态降级并在质量报告中标记。

renderer 接口必须同时接收教学节拍和场景时间：

```tsx
<SceneRenderer plan={plan} step={step} timeMs={renderTime} />
```

不能只传 `step`，否则预览和 MP4 无法共享中间状态。

### 6.3 视觉节奏

- 开场先建立问题和具体对象，少字、强主体。
- 机制页减少装饰，保留因果链和必要标签。
- 案例页让同一主体持续存在，通过状态变化产生连续感。
- 边界页降低运动速度，在风险点停住。
- 总结页压缩信息，不把前面所有卡片原样再放一遍。

## 7. 口播与画面的生成协议

### 7.1 四阶段生成与两个用户确认点

不再一次请求同时生成所有字段。推荐拆成四次可追踪的阶段：

1. `extract-knowledge`：从用户素材提取事实、概念、例子、边界、证据。
2. `plan-teaching`：生成章节、教学节拍、口播稿和屏幕短句。
3. `plan-scenes`：基于已确认的教学节拍生成 ScenePlan。
4. `validate-and-repair`：检查重复、无证据、场景错配、口播薄弱，并只修复失败节拍。

四个阶段不是无条件连续执行，必须有两个用户确认点：

```text
extract-knowledge
  -> plan-teaching
  -> [用户确认文稿：可修改标题、章节、口播、屏幕短句]
  -> plan-scenes
  -> validate-and-repair
  -> [用户确认分镜：可修改场景意图、证据、场景类型和锁定字段]
  -> 预览、音频、导出
```

文稿未确认时，后端不得生成正式 ScenePlan；分镜未确认时，前端不得开始正式 TTS 或 MP4 导出。用户修改口播后，当前 beat 的 `sceneStatus` 变为 `stale`，必须重新设计画面或明确继续使用旧画面。

### 7.2 生成任务状态机

四阶段生成不能继续由创建项目请求同步等待。创建接口只创建项目并返回任务：

```text
POST /api/projects
  -> { projectId, generationJobId, status: "queued" }

generationJob:
  queued
  -> extracting-knowledge
  -> planning-teaching
  -> awaiting-script-approval
  -> planning-scenes
  -> validating
  -> awaiting-storyboard-approval
  -> succeeded | failed | cancelled
```

`awaiting-script-approval` 和 `awaiting-storyboard-approval` 是持久化的暂停状态，不是前端临时状态。文稿确认接口只能把任务从 `awaiting-script-approval` 推进到 `planning-scenes`；分镜确认接口只能把任务从 `awaiting-storyboard-approval` 推进到 `succeeded`。任务未到 `succeeded` 前不能开始 TTS 或 MP4 导出。每个阶段完成后立即保存阶段产物和 trace。job 状态必须持久化到项目的版本目录，不能只保存在进程内存；后端重启后按 `queued` 或 `running` 状态恢复为 `interrupted`，由用户确认后继续，避免重复调用大模型。前端通过轮询 `GET /api/projects/:id/jobs/:jobId` 获取进度；后续可增加 SSE，但不能把 SSE 作为第一版的必要依赖。失败任务必须保存 `failedStage`、错误信息和可重试的输入版本，并支持 `POST /api/projects/:id/jobs/:jobId/retry` 从失败阶段继续。项目生成任务必须按 `projectId + sourceContentRevision + sourceSceneRevision` 幂等，且同一项目同一时间只能有一个 active generation job，防止用户重复点击产生多个写入竞争。必须支持 `POST /api/projects/:id/jobs/:jobId/cancel`，取消后保留已完成阶段结果。

确认接口：

```text
POST /api/projects/:id/jobs/:jobId/approve-script
  仅允许 awaiting-script-approval，保存用户确认的 TeachingPlan

POST /api/projects/:id/jobs/:jobId/approve-storyboard
  仅允许 awaiting-storyboard-approval，保存锁定字段并进入 succeeded
```

两个接口都必须校验当前版本和 workflow 状态；文稿确认增加 `contentRevision`，分镜确认增加 `sceneRevision`，并按依赖关系标记旧音频和视频为 `stale`；重复确认返回当前任务状态，不重复生成或写入。

### 7.3 大模型提示词的核心约束

系统提示词必须包含以下规则，而不是只要求“生成漂亮页面”：

- 先写观众在这一屏之前已经知道什么。
- 明确这一屏唯一的新判断。
- 指出支持该判断的具体证据或案例对象。
- 指出上一屏到这一屏发生了什么变化。
- 选择与关系匹配的 scene type。
- 解释为什么这个动作能帮助理解，而不是只描述动画名称。
- 没有事实时输出 `evidence: []`，不得补造数字。
- 口播不能复述屏幕短句，必须解释原因、机制、例子或边界。
- 连续屏幕不得使用同一开头、同一结论和同一视觉结构。

### 7.4 口播深度模板

每个复杂知识节拍至少满足以下结构中的三项：

1. 先用大白话说明问题。
2. 给出定义和适用前提。
3. 解释为什么会这样，拆出机制。
4. 用一个生活类比降低理解成本。
5. 用一个真实工作场景落地。
6. 说明常见误区或失败原因。
7. 给出边界和人应当做的判断。

这不是要求每一屏机械套七句，而是保证全章完整覆盖。质量门禁要检查“知识覆盖”，而不是只检查字数。

## 8. 项目与版本设计

### 8.1 项目目录

```text
storage/projects/<project-id>/
├── project.json             # 当前项目索引和最新版本
├── versions/<contentRevision>-<sceneRevision>/
│   ├── source.json          # 原始输入
│   ├── knowledge.json       # 知识结构
│   ├── teaching.json       # 口播和教学节拍
│   ├── scenes.json         # 分镜计划
│   └── quality.json         # 生成时的质量报告
├── audio/<contentRevision>-<sceneRevision>/<artifactRevision>/<chapter>/<step>.mp3
└── render/<contentRevision>-<sceneRevision>/<artifactRevision>/video.mp4
```

当前历史项目仍可读取 `project.json` 的旧结构。读取时执行 legacy adapter，写入新版本时再逐步升级，不对历史数据做破坏性覆盖。

### 8.2 版本、产物和并发规则

`revision` 不是简单的自增数字，而是一次不可变内容快照的标识。推荐当前索引包含：

```ts
interface ProjectRevision {
  contentRevision: number;
  sceneRevision: number;
  schemaVersion: number;
  sourceHash: string;
  teachingPlanHash: string;
  scenePlanHash: string;
  createdAt: string;
  createdBy: "llm" | "user" | "migration";
}

interface ArtifactVersion {
  contentRevision: number;
  sceneRevision: number;
  artifactRevision: number;
  status: "ready" | "stale" | "failed";
  provider?: string;
  model?: string;
  configHash?: string;
  createdAt?: string;
  error?: string;
}
```

内容版本和产物版本分开管理：

- 修改标题或原始素材。
- 修改口播。
- 修改场景类型、证据或动作。

以上修改增加 `contentRevision` 或 `sceneRevision`，并让受影响的音频和视频标记为 `stale`。只修改 TTS provider、模型、音色、速度、音量或格式时，不复制知识结构和文稿，只增加 `artifactRevision`，重新生成音频后再按需导出视频。

界面必须显示：当前 `contentRevision`、`sceneRevision`、`artifactRevision`、LLM provider/model、TTS provider/voice，以及音频和 MP4 是否与当前内容版本一致。

写入规则：先写 `versions/<contentRevision>-<sceneRevision>/` 的临时目录，再使用原子 rename 更新 `project.json`；`project.json` 只保存当前版本指针和可用产物索引。生成任务开始时记录 `sourceContentRevision` 与 `sourceSceneRevision`，任务完成时如果当前项目版本已变化，则结果只能保存为孤立任务结果，不能覆盖用户的新版本。旧版本默认保留，用户可以从历史版本恢复为新的内容版本；恢复不是原地覆盖。

### 8.3 真实调用可观测性

每次生成记录：

```ts
interface GenerationTrace {
  provider: "llm" | "local" | "llm-fallback";
  model: string;
  baseUrl: string;
  startedAt: string;
  finishedAt?: string;
  requestCount: number;
  stages: Array<{
    name: string;
    status: "running" | "success" | "failed";
    durationMs?: number;
    error?: string;
  }>;
}
```

当设置为 `llm-required` 时，LLM 调用失败必须明确报错，不能静默使用规则生成。设置页的测试按钮要显示 HTTP 状态、可用模型和最后一次实际使用的模型。

## 9. Studio 页面设计

### 9.1 左侧项目栏

左侧是稳定的项目导航，不是第二个工作区：

- 项目名称。
- 最近更新时间，小字号显示。
- 当前状态：草稿、已确认、合成中、已导出、失败。
- 点击项目直接进入，不显示多余的“打开”按钮。
- 新建项目固定在顶部。
- 项目删除和重命名放入项目的更多菜单。

侧栏只承担项目切换，避免把大量设置、统计和步骤堆在左边。

### 9.2 主工作区四步

#### 1. 文稿

主界面只突出：标题、完整口播、章节结构、生成质量提示。用户先修改讲解内容，保存后才能进入分镜。

#### 2. 分镜

每一屏显示：

- 这一屏要回答的问题。
- 新增信息。
- 口播。
- 场景类型。
- 画面证据。
- 上一屏到这一屏的变化。

允许用户修改口播和场景意图，不让用户直接编辑 CSS。

单屏操作 API：

```text
PATCH /api/projects/:id/beats/:beatId
  修改 screenLine、narration、sceneType、scene intent、actors、actions、证据或锁定字段

POST /api/projects/:id/beats/:beatId/regenerate-scene
  只根据当前 beat、相邻 continuity 和已确认素材重新生成 ScenePlan

POST /api/projects/:id/beats/:beatId/rewrite-narration
  只重写口播，成功后使该 beat 的音频过期，并把依赖该 beat 的 ScenePlan 标记为 stale
```

每个可编辑字段都记录 `editedBy: "user" | "llm"` 和 `locked: boolean`。用户锁定的场景类型、案例对象或证据不得被后续批量生成覆盖；用户点击“重新设计画面”时必须明确是覆盖未锁定字段，还是创建新的候选版本。

单屏口播、场景和素材状态至少包括：`draft`、`confirmed`、`stale`、`failed`。口播重新确认后，只有当前 beat 及其依赖的连续性关系需要重新设计；不相关屏幕保持原有 ScenePlan。

#### 3. 预览

大面积展示单屏画面，底部只放轻量的章节和屏幕导航。口播文本可以折叠，避免预览页面信息过载。提供“只看画面”“画面 + 口播”“自动播放”三个模式。

#### 4. 音频与导出

集中显示 TTS 设置、合成进度、音频试听、MP4 导出状态和产物下载。未保存、场景失败或音频版本过期时，明确告诉用户原因。

### 9.3 设置页

设置页负责后台能力，不占用前台主工作区：

- LLM API Base URL、API Key、模型。
- 测试连接和获取模型列表。
- 默认生成模式：必须使用大模型 / 允许本地规划器。
- TTS provider、voice、语速、音量、格式。
- 本地 TTS 命令和模型路径。
- Chrome、ffmpeg、ffprobe 状态。
- 最近一次调用日志和错误。

API Key 只存后端设置文件或安全存储，前端只显示脱敏状态。

### 9.4 视觉资产策略

场景不应默认依赖随机图片。视觉资产分三类：

```ts
interface AssetManifestItem {
  id: string;
  kind: "user-upload" | "generated-bitmap" | "native-shape" | "external-reference";
  path?: string;
  source?: string;
  width?: number;
  height?: number;
  purpose: "subject" | "evidence" | "texture" | "context";
  fallback: "native-shape" | "document" | "text-only";
  licenseNote?: string;
}
```

优先使用用户提供的真实对象、原生 DOM/SVG/CSS 结构和有来源的数据；只有内容确实需要时才生成 bitmap。素材加载失败必须按 `fallback` 降级，并在质量报告里标记，不得留下空白区域或用无关图片填充。

资产 API：

```text
POST   /api/projects/:id/assets              上传用户素材并返回 assetId
POST   /api/projects/:id/assets/generate     根据已确认 evidence 生成 bitmap 资产
GET    /api/projects/:id/assets/:assetId     获取资产元数据和预览地址
DELETE /api/projects/:id/assets/:assetId     删除未被已确认 ScenePlan 引用的资产
```

生成 bitmap 必须保存 prompt、模型、来源证据和生成时间；已确认分镜引用的资产不能直接删除，只能标记为 unavailable 并触发 fallback。

## 10. 质量门禁与验收

### 10.1 文稿质量

- 至少覆盖问题、定义、机制、例子、边界和总结。
- 每屏口播长度处于可听范围，过长自动建议拆屏。
- 相邻口播相似度低于阈值。
- 每屏都有新的 claim 或 evidence。
- 至少一个贯穿案例，且案例状态跨章节推进。

### 10.2 场景质量

- 场景类型与教学目的匹配。
- 场景必须有至少一个具体 actor、artifact 或 evidence。
- 动作必须对应真实关系，不能全部是 `appear`。
- 连续屏幕不能重复场景类型和布局，除非有连续性理由。
- 没有代码、数据、对话时，不得伪造对应视觉。

### 10.3 视觉质量

- 桌面 1920×1080 无重叠、裁切和过小文字。
- 窄屏预览无横向溢出，核心对象仍可读。
- 每屏有明确视觉焦点，三秒内能判断主信息。
- 字体层级不靠所有文字放大解决，屏幕短句、证据、注释有清楚比例。
- 连续五屏截图中，结构差异明显但主题 tokens 统一。
- `prefers-reduced-motion` 有可用静态结果。
- 连续场景的 DOM 结构相似度低于设定阈值，不能只靠换颜色通过。
- 每个非静态场景至少有一个有效 action，且有效 action 的 `reason` 与 claim 相关。

结构相似度第一版使用可复现的 DOM fingerprint：删除文本、颜色、数字和 asset URL，只保留 `data-scene-type`、元素标签、class 前缀和父子层级；连续屏幕 fingerprint 的 Jaccard 相似度超过 0.82 时记为重复警告。该指标只做软警告，最终自然度仍由人工样片验收判断。

### 10.4 音频和导出质量

- 口播文本与音频 segment 一一对应。
- 修改口播后旧音频被标记过期，不能误用。
- 合成失败显示具体 provider、模型、HTTP 或命令错误。
- MP4 每屏停留时长来自真实音频时长。
- 如果没有音频，使用 `SceneTimeline.durationMs`；如果音频存在，真实音频时长是最终停留时长，SceneTimeline 只负责把动作归一化到该时长。
- 音频存在时，导出器计算 `timeScale = audioDurationMs / plannedDurationMs`，将所有 action 的 `startMs`、`endMs` 和 keyframe 时间乘以 `timeScale`，再按实际音频时长采样；不得简单截断或让最后一个动作落在音频之后。
- 导出前检查 Chrome、ffmpeg、音频文件和当前内容/场景版本。
- 导出抽样帧必须覆盖每个 SceneTimeline 的开始、中间和结束状态。

## 11. 测试方案

### 11.1 单元测试

- 知识结构归一化和缺失证据处理。
- 场景选择规则。
- ScenePlan schema 校验。
- 连续场景重复检查。
- 口播 claim 覆盖和相似度检查。
- legacy project 到新 ScenePlan 的兼容转换。
- SceneTimeline 的递增、边界和 action 引用校验。
- EvidenceRef 到原始素材区间的溯源校验。
- revision 并发写入和 stale artifact 校验。

### 11.2 生成回归集

建立至少六类固定素材：

1. 对话机器人与 Agent 的区别。
2. 退款客服流程。
3. 一篇没有代码的科普文章。
4. 一篇包含真实数据的报告。
5. 一个含人工审批边界的业务流程。
6. 一个包含代码、日志和错误修复的开发任务。

每次改 prompt 或 renderer 都生成这六类样本，检查场景类型、证据、口播和截图差异。

### 11.3 浏览器验收

使用 Playwright 检查：

- `/studio` 可以创建、切换、编辑和保存项目。
- 生成失败不会刷新回初始页面。
- 文稿未确认时不能误进入分镜导出。
- 每个场景 renderer 能在指定 step 打开。
- 画面无重叠、无 overflow、无空白舞台。
- 自动播放过程中音频、step 和场景状态同步。
- `renderTime` 改变时画面状态稳定改变，导出模式不会关闭场景动作。

### 11.4 人工验收问题

每次样片必须回答：

- 不看字幕，能否听懂这一屏在解释什么？
- 只看画面，能否看出对象发生了什么变化？
- 这一屏是否比上一屏新增了事实或关系？
- 动画是否在解释内容，而不是在装饰页面？
- 画面是否让人自然地想看下一屏？

### 11.5 可量化评分

每个回归样本生成质量报告，满分 100：

| 维度 | 分值 | 计算方式 |
| --- | ---: | --- |
| 新信息推进 | 20 | 有新 claim/evidence 的节拍比例 |
| 内容与场景匹配 | 20 | scene type 与 teaching purpose 规则命中率 |
| 视觉差异 | 15 | 连续 DOM/截图结构相似度反向得分 |
| 动作有效性 | 15 | 有真实 reason 且改变状态的 action 比例 |
| 口播深度 | 15 | 机制、例子、边界、前提覆盖 |
| 可读性与布局 | 15 | OCR、重叠、溢出、最小字号检查 |

评分只用于质量提示，不直接阻断所有导出。质量门禁拆成两类：

- **硬阻断**：ScenePlan schema 无效、证据引用不存在、场景或音频缺失、当前产物 stale、DOM 重叠或溢出、Chrome/ffmpeg 不可用、任务失败。
- **软警告**：视觉重复、口播深度不足、场景变化较少、自然度人工评分不足。

存在硬阻断时禁止导出；只有软警告时允许用户明确确认后导出，并在产物中记录 warning。自动评分和人工验收都不能替代对硬错误的检查。

## 12. 分阶段实施计划

### Phase 0：冻结基线

- 保留当前未提交的质量门禁和语义场景修复。
- 为现有项目建立截图和生成数据基线。
- 明确只保留前端 `5174` 和后端 `8787` 两个长期端口。

交付：基线项目、基线截图、回归素材集、当前测试结果。

### Phase 1：建立新领域模型

- 新增 `KnowledgeMap`、`TeachingPlan`、`ScenePlan` 类型。
- 新增 schema 归一化和校验模块。
- 保留 `GeneratedVisualSpec` 作为 legacy 输入适配层。
- 项目保存增加 `revision`、`generationTrace` 和产物版本信息。
- 增加 Evidence、AssetManifest、SceneTimeline 运行时校验。

交付：新 JSON 契约、旧项目可播放、新项目可以保存新字段。

### Phase 2：重做生成链路

- LLM 请求拆成知识提取、教学规划、场景规划、修复四个阶段。
- 将当前一次性 chapter prompt 改成按教学节拍生成 ScenePlan。
- 失败时保留阶段错误和响应摘要，不刷新页面，不静默降级。
- 质量门禁从“长度检查”扩展为“新增信息和证据检查”。
- 把创建项目改为可轮询的 generation job，并支持失败阶段重试。

交付：同一素材每次生成都能解释为什么使用某种场景，重复率明显下降。

### Phase 3：实现三个核心专用 renderer

优先实现：

1. `ChatScene`：真实消息按顺序出现，并表现等待、回复和下一步动作。
2. `WorkflowScene`：一个具体任务沿状态推进，产物在节点上更新。
3. `CaseStudyScene`：同一个案例跨屏保留，展示状态变化。

随后实现 `MechanismScene`、`BoundaryScene`、`DocumentScene`、`ComparisonScene`、`DataScene` 和 `SummaryScene`。

先实现 `renderTime` 和 `getSceneState` 的确定性测试，再实现 renderer。交付：至少三种内容输出在 DOM 结构和动画逻辑上真正不同，并且同一场景能在网页预览和 MP4 中得到一致状态。

### Phase 4：重构 Studio 编辑体验

- 文稿、分镜、预览、导出四步清晰分离。
- 分镜卡片显示教学目的、证据、场景和变化。
- 支持单屏“重新设计画面”，不重新生成整篇文稿。
- 支持单屏口播重写并只重算受影响画面。
- 左侧项目栏只负责项目历史和切换。

交付：用户能够先改文稿，再确认分镜，再生成音频和 MP4。

### Phase 5：连续性和视觉 QA

- 增加跨屏 continuity validator。
- 增加截图差异和重叠检测。
- 增加真实 LLM 回归样本。
- 增加自动播放和导出前检查。
- 建立质量报告页面，显示失败原因和修复建议。

交付：每个生成项目都有可解释的质量报告，不再靠用户发现问题后猜原因。

## 13. 代码落点

建议的目标目录：

```text
presentation/server/
├── knowledgePlanner.js       # 素材 -> KnowledgeMap
├── teachingPlanner.js        # KnowledgeMap -> TeachingPlan
├── scenePlanner.js           # TeachingPlan -> ScenePlan
├── sceneValidator.js         # ScenePlan 结构和内容门禁
├── continuityValidator.js    # 跨屏状态和重复检查
├── generationTrace.js        # LLM 阶段、provider、模型记录
└── legacyVisualAdapter.js    # 旧 GeneratedVisualSpec 兼容

presentation/src/generated/
├── sceneTypes.ts
├── SceneRenderer.tsx
├── scenes/
│   ├── ChatScene.tsx
│   ├── WorkflowScene.tsx
│   ├── CaseStudyScene.tsx
│   ├── MechanismScene.tsx
│   ├── ComparisonScene.tsx
│   ├── DocumentScene.tsx
│   ├── DataScene.tsx
│   ├── BoundaryScene.tsx
│   └── SummaryScene.tsx
├── legacy/GeneratedChapterLegacy.tsx
└── GeneratedChapter.tsx       # runtime orchestration only
```

`GeneratedChapter.tsx` 的职责应逐步缩小为：读取当前 step、选择 renderer、传递主题 tokens 和连续性状态。它不应该继续包含所有场景的 HTML 和 CSS。

## 14. Skill 的最终定位

继续使用项目 Skill，但调整其职责：

- 固化“先稿子、后分镜、再设计、最后音频和导出”的协作流程。
- 固化口播深度、双源原则、内容驱动动画和反模板反模式。
- 为 LLM 提供场景类型选择规则和 JSON 示例。
- 为每个阶段提供自检清单。
- 不把具体颜色、卡片尺寸和某一套动画写死在 Skill 中。

Skill 不负责：

- 保存项目和版本。
- 真的调用用户配置的 API。
- 管理音频和视频产物。
- 运行 React renderer。
- 发现 DOM 重叠或修复响应式布局。

## 15. 成功标准

方案完成后，用同一篇素材重新生成，至少应达到：

1. 连续 6 个章节中，不再出现单一通用卡片网格作为主要视觉。
2. 聊天内容显示真实消息顺序；流程内容显示具体状态推进；机制内容显示内部因果变化；边界内容在风险点停住。
3. 每一屏能指出对应的教学目的、claim、证据和动作理由。
4. 口播不是屏幕文字的同义改写，而是补充原因、机制、例子和边界。
5. 同一贯穿案例在至少三个章节中持续变化，而不是每章换一个例子。
6. 用户可以修改单屏口播、场景意图和证据，并重新生成受影响画面。
7. LLM、TTS、音频、视频和 revision 状态都能在页面中被确认，不存在静默假成功。
8. 1920×1080 导出无重叠、无溢出、无过小文字，移动预览也能正常查看。

## 16. 推荐的第一步

不要先继续调整字体或给当前通用舞台添加更多 CSS。下一步应该先完成 Phase 1，并以“AI Agent 与聊天机器人区别”作为回归素材，打通：

```text
KnowledgeMap
  -> TeachingPlan
  -> ChatScene / WorkflowScene / BoundaryScene
  -> 单屏预览
  -> 口播编辑
  -> 真实 TTS
```

这条最小闭环能够直接验证最关键的产品承诺：画面是否真的根据内容变化，而不是换一组标签继续套同一个模板。
