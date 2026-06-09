import { useCallback, useEffect, useMemo, useState } from "react";
import type { GeneratedProject } from "../generated/types";
import "./Studio.css";

type Provider = "edge-tts" | "say" | "openai" | "piper";
type StudioPage = "compose" | "edit" | "export" | "library";

interface Health {
  ok: boolean;
  defaultProvider: string;
  defaultVoice: string;
  openaiConfigured: boolean;
  chromeConfigured: boolean;
  renderBaseUrl: string;
}

interface ProjectListItem {
  id: string;
  title: string;
  createdAt: string;
  status?: string;
  provider?: string;
  segmentCount: number;
  hasAudio?: boolean;
  hasVideo?: boolean;
}

const STATUS_LABEL: Record<string, string> = {
  draft: "可预览草稿",
  ready: "已生成网页",
  synthesizing: "合成音频中",
  rendering: "导出 MP4 中",
  complete: "已完成",
  failed: "失败",
};

export function Studio() {
  const [health, setHealth] = useState<Health | null>(null);
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [activePage, setActivePage] = useState<StudioPage>("compose");
  const [activeProject, setActiveProject] = useState<GeneratedProject | null>(
    null,
  );
  const [title, setTitle] = useState("什么是 AI Agent");
  const [content, setContent] = useState(
    "AI Agent 不只是会聊天，它会围绕目标拆任务、调用工具、记录进度，并检查结果。请做一个三分钟中文科普视频，讲清楚 Agent 和聊天机器人的区别、典型场景和风险边界。",
  );
  const [provider, setProvider] = useState<Provider>("edge-tts");
  const [voice, setVoice] = useState("zh-CN-YunxiNeural");
  const [draftTitle, setDraftTitle] = useState("");
  const [draftChapters, setDraftChapters] = useState<GeneratedProject["chapters"]>(
    [],
  );
  const [previewGlobalStep, setPreviewGlobalStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const activeId = activeProject?.id || "";
  const isBusy =
    activeProject?.status === "synthesizing" ||
    activeProject?.status === "rendering";
  const draftDirty = Boolean(
    activeProject &&
      (draftTitle !== activeProject.title ||
        JSON.stringify(draftChapters) !== JSON.stringify(activeProject.chapters)),
  );

  const loadProjectDraft = useCallback((project: GeneratedProject) => {
    setDraftTitle(project.title);
    setDraftChapters(cloneDraft(project));
    setPreviewGlobalStep(0);
  }, []);

  const refreshProjects = useCallback(async () => {
    const res = await fetch("/api/projects");
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "项目列表加载失败");
    setProjects(data.projects || []);
  }, []);

  const refreshProject = useCallback(async (id: string) => {
    const res = await fetch(`/api/projects/${id}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "项目加载失败");
    setActiveProject(data);
    loadProjectDraft(data);
  }, [loadProjectDraft]);

  useEffect(() => {
    const loadInitialState = async () => {
      const healthRes = await fetch("/api/health");
      const data = await healthRes.json();
      setHealth(data);
      if (data.defaultProvider) setProvider(data.defaultProvider);
      if (data.defaultVoice) setVoice(data.defaultVoice);
      await refreshProjects();
    };
    void loadInitialState().catch(() => {});
  }, [refreshProjects]);

  useEffect(() => {
    if (!activeId || !isBusy) return;
    const timer = window.setInterval(() => {
      refreshProject(activeId).catch((err) =>
        setError(err instanceof Error ? err.message : String(err)),
      );
      refreshProjects().catch(() => {});
    }, 1800);
    return () => window.clearInterval(timer);
  }, [activeId, isBusy, refreshProject, refreshProjects]);

  const createProject = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          content,
          ttsProvider: provider,
          voice,
          synthesize: false,
          render: false,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "生成失败");
      setActiveProject(data);
      loadProjectDraft(data);
      setActivePage("edit");
      await refreshProjects();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const saveDraft = async () => {
    if (!activeProject) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/projects/${activeProject.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: draftTitle,
          chapters: draftChapters,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "保存失败");
      setActiveProject(data);
      loadProjectDraft(data);
      await refreshProjects();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const runAction = async (
    path: string,
    body: Record<string, unknown> = {},
  ) => {
    if (!activeProject) return;
    if (draftDirty) {
      setError("当前草稿有未保存修改。请先保存并刷新预览，再合成音频或导出 MP4。");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "操作失败");
      setActiveProject(data);
      loadProjectDraft(data);
      await refreshProjects();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const segmentStats = useMemo(() => {
    if (!activeProject) return "尚未生成";
    return `${activeProject.chapters.length} 章 / ${activeProject.segments.length} 屏`;
  }, [activeProject]);

  const previewUrl = activeProject
    ? `/?project=${activeProject.id}`
    : "";
  const audioPreviewUrl = activeProject
    ? `/?project=${activeProject.id}&audio=1`
    : "";
  const autoPreviewUrl = activeProject
    ? `/?project=${activeProject.id}&auto=1`
    : "";
  const videoUrl = activeProject?.video?.url || "";
  const previewFrameUrl = activeProject
    ? `${previewUrl}&renderStep=${previewGlobalStep}`
    : "";
  const stepCount = activeProject?.segments.length || 0;
  const chapterCount = activeProject?.chapters.length || 0;
  const selectProject = (id: string, page: StudioPage = "edit") => {
    setActivePage(page);
    refreshProject(id).catch((err) =>
      setError(err instanceof Error ? err.message : String(err)),
    );
  };

  return (
    <main className="studio">
      <header className="studio-topbar">
        <div>
          <span className="studio-kicker">WEB VIDEO STUDIO</span>
          <h1>视频生成工作台</h1>
        </div>
        <div className="studio-pipeline" aria-label="生成流程">
          <span className={activeProject ? "is-active" : ""}>草稿</span>
          <span className={activeProject?.audio?.length ? "is-active" : ""}>音频</span>
          <span className={activeProject?.video?.file ? "is-active" : ""}>成片</span>
        </div>
      </header>

      <nav className="studio-page-nav" aria-label="工作区分页">
        <button
          className={activePage === "compose" ? "is-active" : ""}
          onClick={() => setActivePage("compose")}
          type="button"
        >
          创建草稿
        </button>
        <button
          className={activePage === "edit" ? "is-active" : ""}
          onClick={() => setActivePage("edit")}
          type="button"
        >
          编辑与预览
        </button>
        <button
          className={activePage === "export" ? "is-active" : ""}
          onClick={() => setActivePage("export")}
          type="button"
        >
          合成与导出
        </button>
        <button
          className={activePage === "library" ? "is-active" : ""}
          onClick={() => setActivePage("library")}
          type="button"
        >
          项目库 / 设置
        </button>
      </nav>

      {error && <div className="studio-error studio-global-error">{error}</div>}

      {activePage === "compose" && (
        <section className="studio-page studio-page-grid">
          <div className="studio-panel studio-compose">
            <div className="studio-section-title">
              <div>
                <span className="studio-panel-kicker">Step 01</span>
                <h2>输入与配置</h2>
                <p>生成可编辑网页草稿，先看画面和节奏，再进入后续制作。</p>
              </div>
              <button className="studio-primary" disabled={loading} onClick={createProject}>
                {loading ? "提交中..." : "生成草稿"}
              </button>
            </div>

            <label>
              标题
              <input value={title} onChange={(e) => setTitle(e.target.value)} />
            </label>

            <label>
              内容 / 大纲 / 口播稿
              <textarea value={content} onChange={(e) => setContent(e.target.value)} />
            </label>

            <div className="studio-grid">
              <label>
                TTS Provider
                <select value={provider} onChange={(e) => setProvider(e.target.value as Provider)}>
                  <option value="edge-tts">edge-tts 本地命令</option>
                  <option value="say">macOS say 离线</option>
                  <option value="openai">OpenAI API</option>
                  <option value="piper">Piper 本地模型</option>
                </select>
              </label>
              <label>
                音色 / 模型音色
                <input value={voice} onChange={(e) => setVoice(e.target.value)} />
              </label>
            </div>

          </div>

          <aside className="studio-side">
            <ProjectSummary
              activeProject={activeProject}
              chapterCount={chapterCount}
              draftDirty={draftDirty}
              segmentStats={segmentStats}
              stepCount={stepCount}
            />
            <ProjectLibrary
              activeProject={activeProject}
              projects={projects}
              onSelect={(id) => selectProject(id)}
            />
          </aside>
        </section>
      )}

      {activePage === "edit" && (
        <section className="studio-page studio-page-grid wide">
          {!activeProject ? (
            <EmptyState
              title="还没有可编辑草稿"
              body="先创建一个草稿，或从项目库选择历史项目。"
              actionLabel="去创建草稿"
              onAction={() => setActivePage("compose")}
            />
          ) : (
            <>
              <div className="studio-panel">
                <DraftEditor
                  chapters={draftChapters}
                  dirty={draftDirty}
                  disabled={loading || isBusy}
                  onChange={setDraftChapters}
                  onPreviewStep={setPreviewGlobalStep}
                  onSave={saveDraft}
                  title={draftTitle}
                  onTitleChange={setDraftTitle}
                />
              </div>

              <aside className="studio-side">
                <div className="studio-preview studio-side-section is-primary">
                  <div className="studio-preview-head">
                    <div>
                      <span className="studio-panel-kicker">Live Preview</span>
                      <h2>网页预览</h2>
                    </div>
                    <a href={previewUrl}>新窗口打开</a>
                  </div>
                  <iframe
                    key={`${activeProject.id}-${activeProject.updatedAt || ""}-${previewGlobalStep}`}
                    src={previewFrameUrl}
                    title="网页视频草稿预览"
                  />
                  <ChapterPreviewNav
                    chapters={draftChapters}
                    currentGlobalStep={previewGlobalStep}
                    onPreviewStep={setPreviewGlobalStep}
                  />
                </div>
              </aside>
            </>
          )}
        </section>
      )}

      {activePage === "export" && (
        <section className="studio-page studio-page-grid">
          {!activeProject ? (
            <EmptyState
              title="还没有选择项目"
              body="选择一个草稿后，再合成音频或导出 MP4。"
              actionLabel="打开项目库"
              onAction={() => setActivePage("library")}
            />
          ) : (
            <>
              <div className="studio-panel">
                <div className="studio-section-title">
                  <div>
                    <span className="studio-panel-kicker">Step 03</span>
                    <h2>合成与导出</h2>
                    <p>确认草稿保存后，再生成中文口播或导出最终 MP4。</p>
                  </div>
                </div>
                <StatusBlock project={activeProject} segmentStats={segmentStats} />
                <div className="studio-metrics">
                  <Metric label="章节" value={chapterCount || "-"} />
                  <Metric label="屏幕" value={stepCount || "-"} />
                  <Metric label="状态" value={statusText(activeProject.status)} />
                </div>
                {draftDirty && (
                  <div className="studio-error">
                    当前草稿有未保存修改。请回到“编辑与预览”保存后再生成产物。
                  </div>
                )}
                <div className="studio-actions large">
                  <button
                    disabled={!activeProject || loading || isBusy || draftDirty}
                    onClick={() =>
                      runAction(`/api/projects/${activeProject.id}/synthesize`, {
                        ttsProvider: provider,
                        voice,
                        force: false,
                      })
                    }
                  >
                    合成音频
                  </button>
                  <button
                    disabled={!activeProject || loading || isBusy || draftDirty}
                    onClick={() =>
                      runAction(`/api/projects/${activeProject.id}/render`, {
                        synthesizeFirst: !activeProject.audio?.length,
                      })
                    }
                  >
                    导出 MP4
                  </button>
                </div>
                <div className="studio-links">
                  {previewUrl && <a href={previewUrl}>打开预览</a>}
                  {Boolean(activeProject.audio?.length) && (
                    <a href={audioPreviewUrl}>带音频预览</a>
                  )}
                  {autoPreviewUrl && <a href={autoPreviewUrl}>自动播放</a>}
                  {videoUrl && <a href={videoUrl}>下载 MP4</a>}
                </div>
              </div>

              <aside className="studio-side">
                <RuntimePanel health={health} />
              </aside>
            </>
          )}
        </section>
      )}

      {activePage === "library" && (
        <section className="studio-page studio-page-grid">
          <ProjectLibrary
            activeProject={activeProject}
            projects={projects}
            variant="large"
            onSelect={(id) => selectProject(id)}
          />
          <aside className="studio-side">
            <RuntimePanel health={health} />
            <div className="studio-note">
              API key 只放后端 <code>.env</code>。真本地模型可用 Piper：下载中文 voice
              后设置 <code>PIPER_MODEL</code>；没有模型时可先用 macOS <code>say</code>{" "}
              离线合成。
            </div>
          </aside>
        </section>
      )}
    </main>
  );
}

function ProjectSummary({
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

function RuntimePanel({ health }: { health: Health | null }) {
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
      </dl>
    </div>
  );
}

function ProjectLibrary({
  activeProject,
  projects,
  onSelect,
  variant = "compact",
}: {
  activeProject: GeneratedProject | null;
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
          <button
            className={project.id === activeProject?.id ? "is-active" : ""}
            key={project.id}
            onClick={() => onSelect(project.id)}
          >
            <strong>{project.title}</strong>
            <span>
              {statusText(project.status)} · {project.segmentCount} 屏
              {project.hasVideo ? " · MP4" : project.hasAudio ? " · 音频" : ""}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function EmptyState({
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
      <button className="studio-primary" onClick={onAction}>
        {actionLabel}
      </button>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function StatusBlock({
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

function statusText(status = "ready") {
  return STATUS_LABEL[status] || status;
}

function cloneDraft(project: GeneratedProject) {
  return project.chapters.map((chapter) => ({
    ...chapter,
    steps: [...chapter.steps],
  }));
}

function DraftEditor({
  chapters,
  dirty,
  disabled,
  onChange,
  onPreviewStep,
  onSave,
  title,
  onTitleChange,
}: {
  chapters: GeneratedProject["chapters"];
  dirty: boolean;
  disabled: boolean;
  onChange: (chapters: GeneratedProject["chapters"]) => void;
  onPreviewStep: (globalStep: number) => void;
  onSave: () => void;
  title: string;
  onTitleChange: (title: string) => void;
}) {
  const chapterOffsets = getChapterOffsets(chapters);

  const updateChapter = (
    index: number,
    patch: Partial<GeneratedProject["chapters"][number]>,
  ) => {
    onChange(
      chapters.map((chapter, i) =>
        i === index ? { ...chapter, ...patch } : chapter,
      ),
    );
  };

  const updateStep = (chapterIndex: number, stepIndex: number, text: string) => {
    onChange(
      chapters.map((chapter, i) => {
        if (i !== chapterIndex) return chapter;
        return {
          ...chapter,
          steps: chapter.steps.map((step, j) => (j === stepIndex ? text : step)),
        };
      }),
    );
  };

  const addStep = (chapterIndex: number) => {
    onChange(
      chapters.map((chapter, i) =>
        i === chapterIndex
          ? { ...chapter, steps: [...chapter.steps, "新的画面口播"] }
          : chapter,
      ),
    );
  };

  const removeStep = (chapterIndex: number, stepIndex: number) => {
    onChange(
      chapters
        .map((chapter, i) => {
          if (i !== chapterIndex) return chapter;
          return {
            ...chapter,
            steps: chapter.steps.filter((_, j) => j !== stepIndex),
          };
        })
        .filter((chapter) => chapter.steps.length > 0),
    );
  };

  return (
    <section className="studio-editor">
      <div className="studio-editor-head">
        <h2>调整草稿内容</h2>
        {dirty && <span>有未保存修改</span>}
        <button disabled={disabled} onClick={onSave}>
          保存并刷新预览
        </button>
      </div>

      <label>
        项目标题
        <input
          disabled={disabled}
          value={title}
          onChange={(event) => onTitleChange(event.target.value)}
        />
      </label>

      <div className="studio-chapters">
        {chapters.map((chapter, chapterIndex) => (
          <article className="studio-chapter-editor" key={chapter.id}>
            <div className="studio-chapter-head">
              <label>
                章节标题
                <input
                  disabled={disabled}
                  value={chapter.title}
                  onChange={(event) =>
                    updateChapter(chapterIndex, { title: event.target.value })
                  }
                />
              </label>
              <button
                className="studio-secondary"
                onClick={() => onPreviewStep(chapterOffsets[chapterIndex] || 0)}
                type="button"
              >
                预览本章
              </button>
            </div>

            {chapter.steps.map((step, stepIndex) => (
              <label className="studio-step-editor" key={`${chapter.id}-${stepIndex}`}>
                <span>第 {stepIndex + 1} 屏口播 / 主画面文字</span>
                <textarea
                  disabled={disabled}
                  value={step}
                  onChange={(event) =>
                    updateStep(chapterIndex, stepIndex, event.target.value)
                  }
                />
                <div className="studio-step-actions">
                  <button
                    onClick={() =>
                      onPreviewStep((chapterOffsets[chapterIndex] || 0) + stepIndex)
                    }
                    type="button"
                  >
                    预览这一屏
                  </button>
                  <button
                    disabled={disabled || chapter.steps.length <= 1}
                    onClick={() => removeStep(chapterIndex, stepIndex)}
                    type="button"
                  >
                    删除这一屏
                  </button>
                </div>
              </label>
            ))}

            <button
              className="studio-secondary"
              disabled={disabled}
              onClick={() => addStep(chapterIndex)}
              type="button"
            >
              添加一屏
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}

function ChapterPreviewNav({
  chapters,
  currentGlobalStep,
  onPreviewStep,
}: {
  chapters: GeneratedProject["chapters"];
  currentGlobalStep: number;
  onPreviewStep: (globalStep: number) => void;
}) {
  const offsets = getChapterOffsets(chapters);
  return (
    <div className="studio-preview-nav">
      {chapters.map((chapter, chapterIndex) => (
        <section key={chapter.id}>
          <button
            className={
              currentGlobalStep >= offsets[chapterIndex] &&
              currentGlobalStep < offsets[chapterIndex] + chapter.steps.length
                ? "is-active"
                : ""
            }
            onClick={() => onPreviewStep(offsets[chapterIndex] || 0)}
            type="button"
          >
            {String(chapterIndex + 1).padStart(2, "0")} {chapter.title}
          </button>
          <div>
            {chapter.steps.map((_, stepIndex) => {
              const globalStep = (offsets[chapterIndex] || 0) + stepIndex;
              return (
                <button
                  className={globalStep === currentGlobalStep ? "is-active" : ""}
                  key={`${chapter.id}-${stepIndex}`}
                  onClick={() => onPreviewStep(globalStep)}
                  type="button"
                >
                  {stepIndex + 1}
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

function getChapterOffsets(chapters: GeneratedProject["chapters"]) {
  const offsets: number[] = [];
  let total = 0;
  for (const chapter of chapters) {
    offsets.push(total);
    total += chapter.steps.length;
  }
  return offsets;
}
