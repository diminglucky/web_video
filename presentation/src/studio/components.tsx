import type { GeneratedProject } from "../generated/types";
import { statusText } from "./status";
import type { Health, ProjectListItem } from "./types";

export function ProjectSummary({
  activeProject,
  chapterCount,
  draftDirty,
  segmentStats,
  stepCount,
}: {
  activeProject: GeneratedProject | null;
  chapterCount: number;
  draftDirty: boolean;
  segmentStats: string;
  stepCount: number;
}) {
  return (
    <div className="studio-side-section">
      <div className="studio-section-title compact">
        <div>
          <span className="studio-panel-kicker">Project</span>
          <h2>当前项目</h2>
        </div>
      </div>
      <StatusBlock project={activeProject} segmentStats={segmentStats} />
      {activeProject?.generation && (
        <div className="studio-generation-badge">
          <span>文稿来源</span>
          <strong>{generationText(activeProject.generation)}</strong>
          {activeProject.generation.fallbackReason && (
            <em>{activeProject.generation.fallbackReason}</em>
          )}
        </div>
      )}
      <div className="studio-metrics">
        <Metric label="章节" value={chapterCount || "-"} />
        <Metric label="屏幕" value={stepCount || "-"} />
        <Metric
          label="状态"
          value={activeProject ? statusText(activeProject.status) : "未选择"}
        />
      </div>
      {draftDirty && <div className="studio-dirty-note">草稿有未保存修改</div>}
    </div>
  );
}

function generationText(generation: NonNullable<GeneratedProject["generation"]>) {
  if (generation.provider === "llm") {
    return `大模型生成 · ${generation.model || "未记录模型"}`;
  }
  if (generation.provider === "local-fallback") {
    return "大模型失败，已本地兜底";
  }
  return "本地规则草稿";
}

export function RuntimePanel({ health }: { health: Health | null }) {
  const localExecution = health?.checks?.localExecution;

  return (
    <div className="studio-side-section">
      <div className="studio-section-title compact">
        <div>
          <span className="studio-panel-kicker">Runtime</span>
          <h2>后端状态</h2>
        </div>
      </div>
      <dl className="studio-runtime">
        <div>
          <dt>Backend</dt>
          <dd>{health ? health.version || "旧后端 / 请重启" : "检测中"}</dd>
        </div>
        <div>
          <dt>Local Exec</dt>
          <dd>
            {localExecution ? (localExecution.ok ? "Ready" : "Blocked") : "检测中"}
          </dd>
        </div>
        <div>
          <dt>Provider</dt>
          <dd>{health?.defaultProvider || "检测中"}</dd>
        </div>
        <div>
          <dt>Voice</dt>
          <dd>{health?.defaultVoice || "检测中"}</dd>
        </div>
        <div>
          <dt>OpenAI Key</dt>
          <dd>{health?.openaiConfigured ? "已配置" : "未配置"}</dd>
        </div>
        <div>
          <dt>Renderer</dt>
          <dd>{health?.chromeConfigured ? "Chrome Ready" : "未配置"}</dd>
        </div>
        <div>
          <dt>ffmpeg</dt>
          <dd>{health?.ffmpegConfigured ? "Ready" : "未检测到"}</dd>
        </div>
        <div>
          <dt>TTS</dt>
          <dd>{health?.ttsConfigured ? "Ready" : "需配置"}</dd>
        </div>
      </dl>
      {localExecution && !localExecution.ok && (
        <div className="studio-runtime-warning">
          <strong>本地命令被拦截</strong>
          <span>{localExecution.message}</span>
        </div>
      )}
    </div>
  );
}

export function ProjectLibrary({
  activeProject,
  onDelete,
  projects,
  onSelect,
  variant = "compact",
}: {
  activeProject: GeneratedProject | null;
  onDelete?: (id: string) => void;
  projects: ProjectListItem[];
  onSelect: (id: string) => void;
  variant?: "compact" | "large";
}) {
  return (
    <div
      className={`studio-side-section studio-library ${
        variant === "large" ? "is-large" : ""
      }`}
    >
      <div className="studio-section-title compact">
        <div>
          <span className="studio-panel-kicker">Library</span>
          <h2>历史项目</h2>
        </div>
      </div>
      <div className="studio-list">
        {projects.length === 0 && <p>暂无项目</p>}
        {projects.map((project) => (
          <div
            className={project.id === activeProject?.id ? "is-active" : ""}
            key={project.id}
          >
            <button onClick={() => onSelect(project.id)} type="button">
              <i>{project.title.slice(0, 1).toUpperCase()}</i>
              <span className="studio-project-copy">
                <strong>{project.title}</strong>
                <small>{formatProjectTime(project.createdAt)}</small>
                <span className="studio-project-meta">
                  <em>{statusText(project.status)}</em>
                  <b>{project.segmentCount} 屏</b>
                  {project.hasVideo ? <b>MP4</b> : project.hasAudio ? <b>音频</b> : null}
                </span>
              </span>
            </button>
            {onDelete && (
              <button
                className="studio-danger-action"
                onClick={() => onDelete(project.id)}
                type="button"
              >
                删除
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function formatProjectTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "时间未知";

  const now = new Date();
  const dateDay = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const nowDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const dayDiff = Math.round((nowDay - dateDay) / 86400000);
  const time = date.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  if (dayDiff === 0) return `今天 ${time}`;
  if (dayDiff === 1) return `昨天 ${time}`;
  return `${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")} ${time}`;
}

export function EmptyState({
  actionLabel,
  body,
  onAction,
  title,
}: {
  actionLabel: string;
  body: string;
  onAction: () => void;
  title: string;
}) {
  return (
    <div className="studio-empty studio-panel">
      <span className="studio-panel-kicker">No Project</span>
      <h2>{title}</h2>
      <p>{body}</p>
      <button className="studio-primary" onClick={onAction} type="button">
        {actionLabel}
      </button>
    </div>
  );
}

export function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function StatusBlock({
  project,
  segmentStats,
}: {
  project: GeneratedProject | null;
  segmentStats: string;
}) {
  if (!project) {
    return <div className="studio-status empty">还没有选中项目</div>;
  }
  const failedJob = Object.entries(project.jobs || {}).find(
    ([, job]) => job.status === "failed",
  );
  return (
    <div className={`studio-status ${project.status}`}>
      <strong>{statusText(project.status)}</strong>
      <span>{segmentStats}</span>
      <span>音频：{project.audio?.length ? `${project.audio.length} 段` : "未合成"}</span>
      <span>视频：{project.video?.file ? "已导出 MP4" : "未导出"}</span>
      {failedJob && <em>{failedJob[1].error || "任务失败"}</em>}
    </div>
  );
}
