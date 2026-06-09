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

export function RuntimePanel({ health }: { health: Health | null }) {
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
              <strong>{project.title}</strong>
              <span>
                {statusText(project.status)} · {project.segmentCount} 屏
                {project.hasVideo ? " · MP4" : project.hasAudio ? " · 音频" : ""}
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
