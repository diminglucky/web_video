import { useCallback, useEffect, useMemo, useState } from "react";
import type { GeneratedProject } from "../generated/types";
import {
  createProject as createProjectRequest,
  deleteProject,
  fetchHealth,
  fetchProject,
  fetchProjects,
  renderProject,
  saveProjectDraft,
  synthesizeProject,
} from "./api";
import {
  EmptyState,
  Metric,
  ProjectLibrary,
  ProjectSummary,
  RuntimePanel,
  StatusBlock,
} from "./components";
import { ChapterPreviewNav, DraftEditor } from "./DraftEditor";
import { statusText } from "./status";
import type { Health, ProjectListItem, Provider, StudioPage } from "./types";
import "./Studio.css";

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
    setProjects(await fetchProjects());
  }, []);

  const refreshProject = useCallback(async (id: string) => {
    const project = await fetchProject(id);
    setActiveProject(project);
    loadProjectDraft(project);
  }, [loadProjectDraft]);

  useEffect(() => {
    const loadInitialState = async () => {
      const data = await fetchHealth();
      setHealth(data);
      if (data.defaultProvider) setProvider(data.defaultProvider as Provider);
      if (data.defaultVoice) setVoice(data.defaultVoice);
      await refreshProjects();
    };
    void loadInitialState().catch((err) =>
      setError(err instanceof Error ? err.message : String(err)),
    );
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
      const project = await createProjectRequest({
        title,
        content,
        ttsProvider: provider,
        voice,
      });
      setActiveProject(project);
      loadProjectDraft(project);
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
      const project = await saveProjectDraft(activeProject.id, {
        title: draftTitle,
        chapters: draftChapters,
      });
      setActiveProject(project);
      loadProjectDraft(project);
      await refreshProjects();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const runSynthesize = async () => {
    if (!activeProject || !ensureDraftSaved(draftDirty, setError)) return;
    setLoading(true);
    setError("");
    try {
      const project = await synthesizeProject(activeProject.id, {
        ttsProvider: provider,
        voice,
        force: false,
      });
      setActiveProject(project);
      loadProjectDraft(project);
      await refreshProjects();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const runRender = async () => {
    if (!activeProject || !ensureDraftSaved(draftDirty, setError)) return;
    setLoading(true);
    setError("");
    try {
      const project = await renderProject(activeProject.id, {
        synthesizeFirst: !activeProject.audio?.length,
      });
      setActiveProject(project);
      loadProjectDraft(project);
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

  const previewUrl = activeProject ? `/?project=${activeProject.id}` : "";
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

  const removeProject = async (id: string) => {
    const ok = window.confirm("确定删除这个项目？本地音频和 MP4 也会一起删除。");
    if (!ok) return;
    setLoading(true);
    setError("");
    try {
      await deleteProject(id);
      if (activeProject?.id === id) {
        setActiveProject(null);
        setDraftTitle("");
        setDraftChapters([]);
        setPreviewGlobalStep(0);
        setActivePage("library");
      }
      await refreshProjects();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
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
        <ComposePage
          activeProject={activeProject}
          chapterCount={chapterCount}
          content={content}
          draftDirty={draftDirty}
          loading={loading}
          onCreate={createProject}
          onSelectProject={(id) => selectProject(id)}
          onDeleteProject={removeProject}
          onSetContent={setContent}
          onSetProvider={setProvider}
          onSetTitle={setTitle}
          onSetVoice={setVoice}
          projects={projects}
          provider={provider}
          segmentStats={segmentStats}
          stepCount={stepCount}
          title={title}
          voice={voice}
        />
      )}

      {activePage === "edit" && (
        <EditPage
          activeProject={activeProject}
          draftChapters={draftChapters}
          draftDirty={draftDirty}
          draftTitle={draftTitle}
          isBusy={isBusy}
          loading={loading}
          onChangeChapters={setDraftChapters}
          onPreviewStep={setPreviewGlobalStep}
          onSave={saveDraft}
          onSetPage={setActivePage}
          onTitleChange={setDraftTitle}
          previewFrameUrl={previewFrameUrl}
          previewGlobalStep={previewGlobalStep}
          previewUrl={previewUrl}
        />
      )}

      {activePage === "export" && (
        <ExportPage
          activeProject={activeProject}
          audioPreviewUrl={audioPreviewUrl}
          autoPreviewUrl={autoPreviewUrl}
          chapterCount={chapterCount}
          draftDirty={draftDirty}
          health={health}
          isBusy={isBusy}
          loading={loading}
          onRender={runRender}
          onSetPage={setActivePage}
          onSynthesize={runSynthesize}
          previewUrl={previewUrl}
          segmentStats={segmentStats}
          stepCount={stepCount}
          videoUrl={videoUrl}
        />
      )}

      {activePage === "library" && (
        <LibraryPage
          activeProject={activeProject}
          health={health}
          onSelectProject={(id) => selectProject(id)}
          onDeleteProject={removeProject}
          projects={projects}
        />
      )}
    </main>
  );
}

function ComposePage({
  activeProject,
  chapterCount,
  content,
  draftDirty,
  loading,
  onCreate,
  onDeleteProject,
  onSelectProject,
  onSetContent,
  onSetProvider,
  onSetTitle,
  onSetVoice,
  projects,
  provider,
  segmentStats,
  stepCount,
  title,
  voice,
}: {
  activeProject: GeneratedProject | null;
  chapterCount: number;
  content: string;
  draftDirty: boolean;
  loading: boolean;
  onCreate: () => void;
  onDeleteProject: (id: string) => void;
  onSelectProject: (id: string) => void;
  onSetContent: (value: string) => void;
  onSetProvider: (value: Provider) => void;
  onSetTitle: (value: string) => void;
  onSetVoice: (value: string) => void;
  projects: ProjectListItem[];
  provider: Provider;
  segmentStats: string;
  stepCount: number;
  title: string;
  voice: string;
}) {
  return (
    <section className="studio-page studio-page-grid">
      <div className="studio-panel studio-compose">
        <div className="studio-section-title">
          <div>
            <span className="studio-panel-kicker">Step 01</span>
            <h2>输入与配置</h2>
            <p>生成可编辑网页草稿，先看画面和节奏，再进入后续制作。</p>
          </div>
          <button className="studio-primary" disabled={loading} onClick={onCreate}>
            {loading ? "提交中..." : "生成草稿"}
          </button>
        </div>

        <label>
          标题
          <input value={title} onChange={(e) => onSetTitle(e.target.value)} />
        </label>

        <label>
          内容 / 大纲 / 口播稿
          <textarea value={content} onChange={(e) => onSetContent(e.target.value)} />
        </label>

        <div className="studio-grid">
          <label>
            TTS Provider
            <select value={provider} onChange={(e) => onSetProvider(e.target.value as Provider)}>
              <option value="edge-tts">edge-tts 本地命令</option>
              <option value="say">macOS say 离线</option>
              <option value="openai">OpenAI API</option>
              <option value="piper">Piper 本地模型</option>
            </select>
          </label>
          <label>
            音色 / 模型音色
            <input value={voice} onChange={(e) => onSetVoice(e.target.value)} />
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
          onDelete={onDeleteProject}
          projects={projects}
          onSelect={onSelectProject}
        />
      </aside>
    </section>
  );
}

function EditPage({
  activeProject,
  draftChapters,
  draftDirty,
  draftTitle,
  isBusy,
  loading,
  onChangeChapters,
  onPreviewStep,
  onSave,
  onSetPage,
  onTitleChange,
  previewFrameUrl,
  previewGlobalStep,
  previewUrl,
}: {
  activeProject: GeneratedProject | null;
  draftChapters: GeneratedProject["chapters"];
  draftDirty: boolean;
  draftTitle: string;
  isBusy: boolean;
  loading: boolean;
  onChangeChapters: (chapters: GeneratedProject["chapters"]) => void;
  onPreviewStep: (globalStep: number) => void;
  onSave: () => void;
  onSetPage: (page: StudioPage) => void;
  onTitleChange: (value: string) => void;
  previewFrameUrl: string;
  previewGlobalStep: number;
  previewUrl: string;
}) {
  return (
    <section className="studio-page studio-page-grid wide">
      {!activeProject ? (
        <EmptyState
          title="还没有可编辑草稿"
          body="先创建一个草稿，或从项目库选择历史项目。"
          actionLabel="去创建草稿"
          onAction={() => onSetPage("compose")}
        />
      ) : (
        <>
          <div className="studio-panel">
            <DraftEditor
              chapters={draftChapters}
              dirty={draftDirty}
              disabled={loading || isBusy}
              onChange={onChangeChapters}
              onPreviewStep={onPreviewStep}
              onSave={onSave}
              title={draftTitle}
              onTitleChange={onTitleChange}
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
                onPreviewStep={onPreviewStep}
              />
            </div>
          </aside>
        </>
      )}
    </section>
  );
}

function ExportPage({
  activeProject,
  audioPreviewUrl,
  autoPreviewUrl,
  chapterCount,
  draftDirty,
  health,
  isBusy,
  loading,
  onRender,
  onSetPage,
  onSynthesize,
  previewUrl,
  segmentStats,
  stepCount,
  videoUrl,
}: {
  activeProject: GeneratedProject | null;
  audioPreviewUrl: string;
  autoPreviewUrl: string;
  chapterCount: number;
  draftDirty: boolean;
  health: Health | null;
  isBusy: boolean;
  loading: boolean;
  onRender: () => void;
  onSetPage: (page: StudioPage) => void;
  onSynthesize: () => void;
  previewUrl: string;
  segmentStats: string;
  stepCount: number;
  videoUrl: string;
}) {
  return (
    <section className="studio-page studio-page-grid">
      {!activeProject ? (
        <EmptyState
          title="还没有选择项目"
          body="选择一个草稿后，再合成音频或导出 MP4。"
          actionLabel="打开项目库"
          onAction={() => onSetPage("library")}
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
                onClick={onSynthesize}
                type="button"
              >
                合成音频
              </button>
              <button
                disabled={!activeProject || loading || isBusy || draftDirty}
                onClick={onRender}
                type="button"
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
  );
}

function LibraryPage({
  activeProject,
  health,
  onDeleteProject,
  onSelectProject,
  projects,
}: {
  activeProject: GeneratedProject | null;
  health: Health | null;
  onDeleteProject: (id: string) => void;
  onSelectProject: (id: string) => void;
  projects: ProjectListItem[];
}) {
  return (
    <section className="studio-page studio-page-grid">
      <ProjectLibrary
        activeProject={activeProject}
        onDelete={onDeleteProject}
        projects={projects}
        variant="large"
        onSelect={onSelectProject}
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
  );
}

function cloneDraft(project: GeneratedProject) {
  return project.chapters.map((chapter) => ({
    ...chapter,
    steps: [...chapter.steps],
  }));
}

function ensureDraftSaved(
  draftDirty: boolean,
  setError: (message: string) => void,
) {
  if (!draftDirty) return true;
  setError("当前草稿有未保存修改。请先保存并刷新预览，再合成音频或导出 MP4。");
  return false;
}
