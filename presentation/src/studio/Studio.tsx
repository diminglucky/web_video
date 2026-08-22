import { useCallback, useEffect, useMemo, useState } from "react";
import type { GeneratedProject } from "../generated/types";
import {
  createProject as createProjectRequest,
  deleteProject,
  fetchHealth,
  fetchProject,
  fetchProjects,
  fetchSettings,
  renderProject,
  saveProjectDraft,
  saveSettings as saveSettingsRequest,
  synthesizeProject,
  testLocalTtsSettings,
  testLlmSettings,
  testTtsSettings,
} from "./api";
import {
  EmptyState,
  Metric,
  ProjectLibrary,
  ProjectSummary,
  RuntimePanel,
  StatusBlock,
} from "./components";
import { statusText } from "./status";
import type {
  Health,
  LlmModelItem,
  ProjectListItem,
  Provider,
  StudioPage,
  StudioSettings,
} from "./types";
import "./Studio.css";

const DEFAULT_SETTINGS: StudioSettings["values"] = {
  WEB_VIDEO_RENDER_BASE_URL: "http://127.0.0.1:5174",
  WEB_VIDEO_CHROME_PATH: "",
  WEB_VIDEO_RENDER_FPS: "30",
  WEB_VIDEO_RENDER_SETTLE_MS: "1400",
  WEB_VIDEO_TTS_PROVIDER: "windows-sapi",
  WEB_VIDEO_TTS_VOICE: "Microsoft Huihui Desktop - Chinese (Simplified)",
  WEB_VIDEO_TTS_RATE: "0",
  WEB_VIDEO_TTS_VOLUME: "100",
  WEB_VIDEO_TTS_FORMAT: "mp3",
  WEB_VIDEO_TTS_FALLBACK: "none",
  WEB_VIDEO_TTS_FALLBACK_VOICE: "Tingting",
  WEB_VIDEO_SCRIPT_PROVIDER: "llm-required",
  WEB_VIDEO_LLM_MODEL: "gpt-4o-mini",
  WEB_VIDEO_LLM_TIMEOUT_MS: "45000",
  OPENAI_API_KEY: "",
  OPENAI_BASE_URL: "https://api.openai.com/v1",
  OPENAI_TTS_BASE_URL: "",
  OPENAI_TTS_MODEL: "gpt-4o-mini-tts",
  PIPER_BIN: "piper",
  PIPER_MODEL: "",
};

const STUDIO_ACTIVE_PAGE_KEY = "web-video-studio-active-page";
const STUDIO_ACTIVE_PROJECT_KEY = "web-video-studio-active-project";
const STUDIO_PAGES: StudioPage[] = [
  "script",
  "storyboard",
  "design",
  "export",
  "projects",
  "settings",
];

export function Studio() {
  const [health, setHealth] = useState<Health | null>(null);
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [activePage, setActivePage] = useState<StudioPage>(getInitialStudioPage);
  const [activeProject, setActiveProject] = useState<GeneratedProject | null>(
    null,
  );
  const [title, setTitle] = useState("什么是 AI Agent");
  const [content, setContent] = useState(
    "AI Agent 不只是会聊天，它会围绕目标拆任务、调用工具、记录进度，并检查结果。请做一个三分钟中文科普视频，讲清楚 Agent 和聊天机器人的区别、典型场景和风险边界。",
  );
  const [provider, setProvider] = useState<Provider>("edge-tts");
  const [voice, setVoice] = useState("zh-CN-YunxiNeural");
  const [settings, setSettings] = useState<StudioSettings | null>(null);
  const [settingsDraft, setSettingsDraft] =
    useState<StudioSettings["values"]>(DEFAULT_SETTINGS);
  const [settingsSaved, setSettingsSaved] = useState("");
  const [llmModels, setLlmModels] = useState<LlmModelItem[]>([]);
  const [llmTestState, setLlmTestState] = useState<{
    tone: "idle" | "pending" | "success" | "error";
    message: string;
  }>({ tone: "idle", message: "" });
  const [ttsTestState, setTtsTestState] = useState<{
    tone: "idle" | "pending" | "success" | "error";
    message: string;
  }>({ tone: "idle", message: "" });
  const [draftTitle, setDraftTitle] = useState("");
  const [draftChapters, setDraftChapters] = useState<GeneratedProject["chapters"]>(
    [],
  );
  const [scriptApproved, setScriptApproved] = useState(false);
  const [storyboardApproved, setStoryboardApproved] = useState(false);
  const [previewGlobalStep, setPreviewGlobalStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [operationMessage, setOperationMessage] = useState("");

  const activeId = activeProject?.id || "";
  const isBusy =
    activeProject?.status === "synthesizing" ||
    activeProject?.status === "rendering";
  const draftDirty = Boolean(
    activeProject &&
      (draftTitle !== activeProject.title ||
        JSON.stringify(draftChapters) !== JSON.stringify(activeProject.chapters)),
  );

  const loadProjectDraft = useCallback((
    project: GeneratedProject,
    options: { resetPreview?: boolean; resetWorkflow?: boolean } = {},
  ) => {
    setDraftTitle(project.title);
    setDraftChapters(cloneDraft(project));
    if (options.resetPreview) setPreviewGlobalStep(0);
    if (options.resetWorkflow) {
      setScriptApproved(false);
      setStoryboardApproved(false);
      return;
    }
    setScriptApproved(Boolean(project.workflow?.scriptApproved));
    setStoryboardApproved(Boolean(project.workflow?.storyboardApproved));
  }, []);

  const refreshProjects = useCallback(async () => {
    setProjects(await fetchProjects());
  }, []);

  const refreshProject = useCallback(async (
    id: string,
    options: { resetPreview?: boolean; resetWorkflow?: boolean } = {},
  ) => {
    const project = await fetchProject(id);
    setActiveProject(project);
    loadProjectDraft(project, options);
  }, [loadProjectDraft]);

  const waitForProjectJob = useCallback(async (
    id: string,
    kind: "synthesize" | "render",
    label: string,
  ) => {
    let latest = await fetchProject(id);
    for (let attempt = 0; attempt < 60; attempt += 1) {
      setActiveProject(latest);
      loadProjectDraft(latest);
      await refreshProjects().catch(() => {});

      const job = latest.jobs?.[kind];
      const busy =
        latest.status === "synthesizing" ||
        latest.status === "rendering" ||
        job?.status === "running" ||
        job?.status === "waiting-for-audio";

      if (!busy) return latest;
      setOperationMessage(`${label}进行中，请稍等...`);
      await sleep(1000);
      latest = await fetchProject(id);
    }
    return latest;
  }, [loadProjectDraft, refreshProjects]);

  useEffect(() => {
    const loadInitialState = async () => {
      const [data, loadedSettings] = await Promise.all([
        fetchHealth(),
        fetchSettings(),
      ]);
      setHealth(data);
      setSettings(loadedSettings);
      setSettingsDraft(loadedSettings.values);
      if (loadedSettings.values.WEB_VIDEO_TTS_PROVIDER) {
        setProvider(loadedSettings.values.WEB_VIDEO_TTS_PROVIDER);
      } else if (data.defaultProvider) {
        setProvider(data.defaultProvider as Provider);
      }
      if (loadedSettings.values.WEB_VIDEO_TTS_VOICE) {
        setVoice(loadedSettings.values.WEB_VIDEO_TTS_VOICE);
      } else if (data.defaultVoice) {
        setVoice(data.defaultVoice);
      }
      await refreshProjects();
      const storedProjectId = window.localStorage.getItem(STUDIO_ACTIVE_PROJECT_KEY);
      if (storedProjectId) {
        await refreshProject(storedProjectId, { resetPreview: true }).catch(() => {
          window.localStorage.removeItem(STUDIO_ACTIVE_PROJECT_KEY);
        });
      }
    };
    void loadInitialState().catch((err) =>
      setError(err instanceof Error ? err.message : String(err)),
    );
  }, [refreshProject, refreshProjects]);

  useEffect(() => {
    window.localStorage.setItem(STUDIO_ACTIVE_PAGE_KEY, activePage);
  }, [activePage]);

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
    setOperationMessage("正在调用后台大模型生成文稿，通常需要 2-4 分钟，请不要重复点击。");
    try {
      const project = await createProjectRequest({
        title,
        content,
        ttsProvider: provider,
        voice,
        ttsRate: settingsDraft.WEB_VIDEO_TTS_RATE,
        ttsVolume: settingsDraft.WEB_VIDEO_TTS_VOLUME,
        ttsFormat: settingsDraft.WEB_VIDEO_TTS_FORMAT,
      });
      window.localStorage.setItem(STUDIO_ACTIVE_PROJECT_KEY, project.id);
      setActiveProject(project);
      loadProjectDraft(
        { ...project, workflow: { scriptApproved: false, storyboardApproved: false } },
        { resetPreview: true, resetWorkflow: true },
      );
      setActivePage("script");
      await refreshProjects();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const saveDraft = async (workflow?: GeneratedProject["workflow"]) => {
    if (!activeProject) return false;
    setLoading(true);
    setError("");
    setOperationMessage("");
    try {
      const project = await saveProjectDraft(activeProject.id, {
        title: draftTitle,
        chapters: draftChapters,
        workflow: workflow || {
          scriptApproved,
          storyboardApproved: scriptApproved && storyboardApproved,
        },
      });
      setActiveProject(project);
      loadProjectDraft(project);
      await refreshProjects();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return false;
    } finally {
      setLoading(false);
    }
  };

  const runSynthesize = async () => {
    if (!activeProject || !ensureDraftSaved(draftDirty, setError)) return;
    setLoading(true);
    setError("");
    const forceAudio = Boolean(activeProject.audio?.length);
    setOperationMessage(
      forceAudio
        ? "已提交重新合成音频任务，正在覆盖旧音频..."
        : "已提交音频合成任务，正在等待后台处理...",
    );
    try {
      const project = await synthesizeProject(activeProject.id, {
        ttsProvider: provider,
        voice,
        ttsRate: settingsDraft.WEB_VIDEO_TTS_RATE,
        ttsVolume: settingsDraft.WEB_VIDEO_TTS_VOLUME,
        ttsFormat: settingsDraft.WEB_VIDEO_TTS_FORMAT,
        force: forceAudio,
      });
      setActiveProject(project);
      loadProjectDraft(project);
      const latest = await waitForProjectJob(project.id, "synthesize", "音频合成");
      const synthesizeJob = latest.jobs?.synthesize;
      if (synthesizeJob?.status === "failed") {
        throw new Error(synthesizeJob.error || "音频合成失败。");
      }
      setOperationMessage(
        latest.audio?.length
          ? `音频合成完成：${latest.audio.length} 段。`
          : "音频任务已结束，但没有发现生成的音频文件。",
      );
      await refreshProjects();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      setOperationMessage(`音频合成失败：${message}`);
    } finally {
      setLoading(false);
    }
  };

  const runRender = async () => {
    if (!activeProject || !ensureDraftSaved(draftDirty, setError)) return;
    setLoading(true);
    setError("");
    setOperationMessage("已提交 MP4 导出任务，正在等待后台处理...");
    try {
      const project = await renderProject(activeProject.id, {
        synthesizeFirst: !activeProject.audio?.length,
        ttsProvider: provider,
        voice,
        ttsRate: settingsDraft.WEB_VIDEO_TTS_RATE,
        ttsVolume: settingsDraft.WEB_VIDEO_TTS_VOLUME,
        ttsFormat: settingsDraft.WEB_VIDEO_TTS_FORMAT,
      });
      setActiveProject(project);
      loadProjectDraft(project);
      const latest = await waitForProjectJob(project.id, "render", "MP4 导出");
      const renderJob = latest.jobs?.render;
      if (renderJob?.status === "failed") {
        throw new Error(renderJob.error || "MP4 导出失败。");
      }
      setOperationMessage(
        latest.video?.file
          ? "MP4 导出完成。"
          : "MP4 导出任务已结束，但没有发现视频文件。",
      );
      await refreshProjects();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      setOperationMessage(`MP4 导出失败：${message}`);
    } finally {
      setLoading(false);
    }
  };

  const saveStudioSettings = async () => {
    setLoading(true);
    setError("");
    setSettingsSaved("");
    try {
      const saved = await saveSettingsRequest(settingsDraft);
      const refreshedHealth = await fetchHealth();
      setSettings(saved);
      setSettingsDraft(saved.values);
      setHealth(refreshedHealth);
      setProvider(saved.values.WEB_VIDEO_TTS_PROVIDER);
      setVoice(saved.values.WEB_VIDEO_TTS_VOICE);
      setSettingsSaved("设置已保存，后续生成会使用这套后台配置。");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const clearStoredApiKey = async () => {
    setLoading(true);
    setError("");
    setSettingsSaved("");
    setLlmTestState({ tone: "idle", message: "" });
    setTtsTestState({ tone: "idle", message: "" });
    try {
      const saved = await saveSettingsRequest({
        ...settingsDraft,
        OPENAI_API_KEY: "",
        OPENAI_API_KEY_CLEAR: true,
      });
      const refreshedHealth = await fetchHealth();
      setSettings(saved);
      setSettingsDraft(saved.values);
      setHealth(refreshedHealth);
      setSettingsSaved("已清除后端保存的 API Key。");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const testStudioLlmSettings = async () => {
    setLoading(true);
    setError("");
    setSettingsSaved("");
    setLlmTestState({
      tone: "pending",
      message: `正在请求 ${settingsDraft.OPENAI_BASE_URL.replace(/\/+$/u, "")}/models，测试 API 并读取模型列表...`,
    });
    try {
      const result = await testLlmSettings({
        apiKey: settingsDraft.OPENAI_API_KEY.trim(),
        baseUrl: settingsDraft.OPENAI_BASE_URL,
        timeoutMs: settingsDraft.WEB_VIDEO_LLM_TIMEOUT_MS,
      });
      setLlmModels(result.models);
      const firstModel = result.models[0]?.id;
      if (!settingsDraft.WEB_VIDEO_LLM_MODEL && firstModel) {
        setSettingsDraft({
          ...settingsDraft,
          WEB_VIDEO_LLM_MODEL: firstModel,
        });
      }
      const nextSettings = {
        ...settingsDraft,
        WEB_VIDEO_LLM_MODEL: settingsDraft.WEB_VIDEO_LLM_MODEL || firstModel || "",
      };
      const saved = await saveSettingsRequest(nextSettings);
      const refreshedHealth = await fetchHealth();
      setSettings(saved);
      setSettingsDraft(saved.values);
      setHealth(refreshedHealth);
      setProvider(saved.values.WEB_VIDEO_TTS_PROVIDER);
      setVoice(saved.values.WEB_VIDEO_TTS_VOICE);
      setSettingsSaved("大模型接口已测试通过，并已保存到后端配置。");
      setLlmTestState({
        tone: "success",
        message: `测试成功：接口可用，已加载 ${result.models.length} 个模型，并已保存当前配置。`,
      });
    } catch (err) {
      setLlmModels([]);
      const message = err instanceof Error ? err.message : String(err);
      setLlmTestState({
        tone: "error",
        message: `测试失败：${message}`,
      });
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const testStudioTtsSettings = async () => {
    setLoading(true);
    setError("");
    setSettingsSaved("");
    setTtsTestState({
      tone: "pending",
      message: "正在请求 OpenAI TTS /audio/speech，测试语音接口是否真的可用...",
    });
    try {
      const result = await testTtsSettings({
        apiKey: settingsDraft.OPENAI_API_KEY.trim(),
        baseUrl: settingsDraft.OPENAI_TTS_BASE_URL || settingsDraft.OPENAI_BASE_URL,
        model: settingsDraft.OPENAI_TTS_MODEL,
        voice: settingsDraft.WEB_VIDEO_TTS_VOICE,
      });
      const saved = await saveSettingsRequest({
        ...settingsDraft,
        OPENAI_TTS_BASE_URL: settingsDraft.OPENAI_TTS_BASE_URL || result.baseUrl,
        WEB_VIDEO_TTS_PROVIDER: "openai",
        WEB_VIDEO_TTS_VOICE: result.voice,
        OPENAI_TTS_MODEL: result.model,
      });
      const refreshedHealth = await fetchHealth();
      setSettings(saved);
      setSettingsDraft(saved.values);
      setHealth(refreshedHealth);
      setProvider(saved.values.WEB_VIDEO_TTS_PROVIDER);
      setVoice(saved.values.WEB_VIDEO_TTS_VOICE);
      setSettingsSaved("OpenAI TTS 测试通过，并已保存为当前语音合成配置。");
      setTtsTestState({
        tone: "success",
        message: `测试成功：${result.baseUrl}/audio/speech 可生成音频，模型 ${result.model}，音色 ${result.voice}。`,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setTtsTestState({
        tone: "error",
        message: `测试失败：${message}`,
      });
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const testStudioLocalTtsSettings = async () => {
    setLoading(true);
    setError("");
    setSettingsSaved("");
    setTtsTestState({
      tone: "pending",
      message: "正在调用本机语音引擎，测试离线 TTS 是否可用...",
    });
    try {
      const result = await testLocalTtsSettings({
        provider: settingsDraft.WEB_VIDEO_TTS_PROVIDER,
        voice: settingsDraft.WEB_VIDEO_TTS_VOICE,
        rate: settingsDraft.WEB_VIDEO_TTS_RATE,
        volume: settingsDraft.WEB_VIDEO_TTS_VOLUME,
        format: settingsDraft.WEB_VIDEO_TTS_FORMAT,
      });
      const saved = await saveSettingsRequest({
        ...settingsDraft,
        WEB_VIDEO_TTS_PROVIDER: result.provider,
        WEB_VIDEO_TTS_VOICE: result.voice,
        WEB_VIDEO_TTS_RATE: String(result.rate),
        WEB_VIDEO_TTS_VOLUME: String(result.volume),
        WEB_VIDEO_TTS_FORMAT: result.format,
      });
      const refreshedHealth = await fetchHealth();
      setSettings(saved);
      setSettingsDraft(saved.values);
      setHealth(refreshedHealth);
      setProvider(saved.values.WEB_VIDEO_TTS_PROVIDER);
      setVoice(saved.values.WEB_VIDEO_TTS_VOICE);
      setSettingsSaved("本地 TTS 测试通过，并已保存为当前语音合成配置。");
      setTtsTestState({
        tone: "success",
        message: `本地语音可用：${result.voice || result.provider}，语速 ${result.rate}，音量 ${result.volume}。`,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setTtsTestState({
        tone: "error",
        message: `本地 TTS 测试失败：${message}`,
      });
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const segmentStats = useMemo(() => {
    if (!activeProject) return "尚未生成";
    return `${activeProject.chapters.length} 章 / ${activeProject.segments.length} 屏`;
  }, [activeProject]);
  const scriptGeneratorLabel = getScriptGeneratorLabel(settings);

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
  const canOpenStoryboard = Boolean(activeProject && scriptApproved);
  const canOpenDesign = Boolean(activeProject && storyboardApproved);
  const canOpenExport = true;

  const updateScriptChapters = (chapters: GeneratedProject["chapters"]) => {
    setDraftChapters(chapters);
    setScriptApproved(false);
    setStoryboardApproved(false);
  };

  const updateScriptTitle = (value: string) => {
    setDraftTitle(value);
    setScriptApproved(false);
    setStoryboardApproved(false);
  };

  const updateStoryboardChapters = (chapters: GeneratedProject["chapters"]) => {
    setDraftChapters(chapters);
    setStoryboardApproved(false);
  };

  const approveScript = async () => {
    if (
      !(await saveDraft({
        scriptApproved: true,
        storyboardApproved: false,
        scriptApprovedAt: new Date().toISOString(),
      }))
    ) {
      return;
    }
    setScriptApproved(true);
    setStoryboardApproved(false);
    setActivePage("storyboard");
  };

  const approveStoryboard = async () => {
    if (
      !(await saveDraft({
        scriptApproved: true,
        storyboardApproved: true,
        scriptApprovedAt:
          activeProject?.workflow?.scriptApprovedAt || new Date().toISOString(),
        storyboardApprovedAt: new Date().toISOString(),
      }))
    ) {
      return;
    }
    setScriptApproved(true);
    setStoryboardApproved(true);
    setActivePage("design");
  };

  const selectProject = async (id: string, page: StudioPage = "script") => {
    if (id === activeProject?.id) {
      setActivePage(page);
      return;
    }
    if (draftDirty) {
      const ok = window.confirm("当前项目有未保存修改，切换项目会丢失这些改动。确定继续？");
      if (!ok) return;
    }
    setLoading(true);
    setError("");
    setOperationMessage("正在打开项目...");
    try {
      await refreshProject(id, { resetPreview: true });
      window.localStorage.setItem(STUDIO_ACTIVE_PROJECT_KEY, id);
      setActivePage(page);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
      setOperationMessage("");
    }
  };

  const openScriptComposer = () => {
    if (draftDirty) {
      const ok = window.confirm("当前项目有未保存修改，进入新建文稿会丢失这些改动。确定继续？");
      if (!ok) return;
    }
    window.localStorage.removeItem(STUDIO_ACTIVE_PROJECT_KEY);
    setActiveProject(null);
    setDraftTitle("");
    setDraftChapters([]);
    setPreviewGlobalStep(0);
    setScriptApproved(false);
    setStoryboardApproved(false);
    setError("");
    setOperationMessage("");
    setActivePage("script");
  };

  const removeProject = async (id: string) => {
    const ok = window.confirm("确定删除这个项目？本地音频和 MP4 也会一起删除。");
    if (!ok) return;
    setLoading(true);
    setError("");
    try {
      await deleteProject(id);
      if (activeProject?.id === id) {
        window.localStorage.removeItem(STUDIO_ACTIVE_PROJECT_KEY);
        setActiveProject(null);
        setDraftTitle("");
        setDraftChapters([]);
        setPreviewGlobalStep(0);
        setScriptApproved(false);
        setStoryboardApproved(false);
        setActivePage("projects");
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
      <aside className="studio-sidebar">
        <div className="studio-brand">
          <span className="studio-kicker">WEB VIDEO STUDIO</span>
          <h1>视频工作台</h1>
          <p>每次生成都是一个独立项目，左侧随时切换历史。</p>
        </div>
        <button
          className="studio-new-project"
          disabled={loading}
          onClick={openScriptComposer}
          type="button"
        >
          {loading ? "当前任务进行中..." : "新建 / 生成文稿"}
        </button>
        <ProjectLibrary
          activeProject={activeProject}
          onDelete={removeProject}
          projects={projects}
          onSelect={(id) => selectProject(id)}
        />
      </aside>

      <section className="studio-main">
        <header className="studio-topbar">
          <div>
            <span className="studio-kicker">Current Workspace</span>
            <h1>{activeProject?.title || "创建或选择一个项目"}</h1>
          </div>
          <div className="studio-top-actions">
            <button
              className={`studio-settings-entry ${
                activePage === "projects" ? "is-active" : ""
              }`}
              onClick={() => setActivePage("projects")}
              type="button"
            >
              项目总览
            </button>
            <button
              className={`studio-settings-entry ${
                activePage === "settings" ? "is-active" : ""
              }`}
              onClick={() => setActivePage("settings")}
              type="button"
            >
              设置
            </button>
          </div>
        </header>

        <nav className="studio-page-nav" aria-label="工作区分页">
          <button
            className={activePage === "script" ? "is-active" : ""}
            onClick={() => setActivePage("script")}
            type="button"
          >
            <strong>文稿</strong>
            <span>先看稿，可修改</span>
          </button>
          <button
            className={activePage === "storyboard" ? "is-active" : ""}
            disabled={!canOpenStoryboard}
            onClick={() => setActivePage("storyboard")}
            type="button"
          >
            <strong>分镜</strong>
            <span>确认每屏内容</span>
          </button>
          <button
            className={activePage === "design" ? "is-active" : ""}
            disabled={!canOpenDesign}
            onClick={() => setActivePage("design")}
            type="button"
          >
            <strong>设计</strong>
            <span>预览网页画面</span>
          </button>
          <button
            className={activePage === "export" ? "is-active" : ""}
            disabled={!canOpenExport}
            onClick={() => setActivePage("export")}
            type="button"
          >
            <strong>导出</strong>
            <span>音频 / MP4</span>
          </button>
        </nav>

        <WorkflowHint
          activePage={activePage}
          hasProject={Boolean(activeProject)}
          scriptApproved={scriptApproved}
          storyboardApproved={storyboardApproved}
        />

        {error && <div className="studio-error studio-global-error">{error}</div>}
        {operationMessage && (
          <div className="studio-dirty-note studio-global-error">
            {operationMessage}
          </div>
        )}

        {activePage === "script" && (
          <ScriptPage
            activeProject={activeProject}
            chapterCount={chapterCount}
            content={content}
            draftDirty={draftDirty}
            draftChapters={draftChapters}
            draftTitle={draftTitle}
          loading={loading}
          onCreate={createProject}
          onApproveScript={approveScript}
          onChangeChapters={updateScriptChapters}
          onSave={saveDraft}
            onSetContent={setContent}
            onSetTitle={setTitle}
            onTitleChange={updateScriptTitle}
          segmentStats={segmentStats}
          settings={settings}
            scriptGeneratorLabel={scriptGeneratorLabel}
            stepCount={stepCount}
            title={title}
          />
        )}

        {activePage === "storyboard" && (
          <StoryboardPage
            activeProject={activeProject}
            draftChapters={draftChapters}
            draftDirty={draftDirty}
            isBusy={isBusy}
            loading={loading}
            onApproveStoryboard={approveStoryboard}
            onChangeChapters={updateStoryboardChapters}
            onSave={saveDraft}
            onSetPage={setActivePage}
          />
        )}

        {activePage === "design" && (
          <DesignPage
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

        {activePage === "projects" && (
          <ProjectsPage
            activeProject={activeProject}
            health={health}
            projects={projects}
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

        {activePage === "settings" && (
          <SettingsPage
            health={health}
            loading={loading}
            onChangeSettings={setSettingsDraft}
            onClearStoredApiKey={clearStoredApiKey}
            onTestLlmSettings={testStudioLlmSettings}
            onTestLocalTtsSettings={testStudioLocalTtsSettings}
            onTestTtsSettings={testStudioTtsSettings}
            onSaveSettings={saveStudioSettings}
            llmModels={llmModels}
            llmTestState={llmTestState}
            savedMessage={settingsSaved}
            settings={settings}
            settingsDraft={settingsDraft}
            ttsTestState={ttsTestState}
          />
        )}
      </section>
    </main>
  );
}

function WorkflowHint({
  activePage,
  hasProject,
  scriptApproved,
  storyboardApproved,
}: {
  activePage: StudioPage;
  hasProject: boolean;
  scriptApproved: boolean;
  storyboardApproved: boolean;
}) {
  if (activePage === "settings") {
    return (
      <div className="studio-workflow-hint">
        <strong>后台设置独立于创作流程</strong>
        <span>API Key、Base URL、TTS、Chrome 和导出参数都放在这里，前台只保留创作动作。</span>
      </div>
    );
  }

  const copy: Record<Exclude<StudioPage, "settings">, { title: string; body: string }> = {
    script: hasProject
      ? {
          title: "当前任务：先让用户看到可编辑文稿",
          body: "这里是最终口播内容。用户改完并确认后，才会进入分镜和网页设计。",
        }
      : {
          title: "当前任务：输入素材，只生成文稿",
          body: "先不要让用户面对动画和样式，把主题、素材或原稿放进来，生成一版可编辑口播稿。",
        },
    storyboard: {
      title: "当前任务：把文稿拆成每一屏",
      body: "这里只决定节奏和信息密度，不讨论颜色、字体和动画。确认分镜后再打开设计预览。",
    },
    design: {
      title: "当前任务：根据已确认内容看网页画面",
      body: "现在才进入视觉设计。左边可分别微调屏幕文案和真实口播，右边逐屏预览网页效果。",
    },
    export: {
      title: "当前任务：保存后合成音频或导出 MP4",
      body: "导出前需要文稿和分镜都已经确认，且草稿没有未保存修改。",
    },
    projects: {
      title: "项目历史：每个生成结果都是独立项目",
      body: "在这里打开以前的项目；打开后会进入该项目上下文，可以继续看文稿、改分镜、设计或导出。",
    },
  };

  const state = copy[activePage];
  const next = !hasProject
    ? "先生成文稿"
    : !scriptApproved
      ? "确认文稿后解锁分镜"
      : !storyboardApproved
        ? "确认分镜后解锁设计"
        : "可以设计、合成与导出";

  return (
    <div className="studio-workflow-hint">
      <strong>{state.title}</strong>
      <span>{state.body}</span>
      <em>{next}</em>
    </div>
  );
}

function ScriptPage({
  activeProject,
  chapterCount,
  content,
  draftChapters,
  draftDirty,
  draftTitle,
  loading,
  onApproveScript,
  onChangeChapters,
  onCreate,
  onSave,
  onSetContent,
  onSetTitle,
  onTitleChange,
  segmentStats,
  settings,
  scriptGeneratorLabel,
  stepCount,
  title,
}: {
  activeProject: GeneratedProject | null;
  chapterCount: number;
  content: string;
  draftChapters: GeneratedProject["chapters"];
  draftDirty: boolean;
  draftTitle: string;
  loading: boolean;
  onApproveScript: () => void;
  onChangeChapters: (chapters: GeneratedProject["chapters"]) => void;
  onCreate: () => void;
  onSave: () => void;
  onSetContent: (value: string) => void;
  onSetTitle: (value: string) => void;
  onTitleChange: (value: string) => void;
  segmentStats: string;
  settings: StudioSettings | null;
  scriptGeneratorLabel: string;
  stepCount: number;
  title: string;
}) {
  return (
    <section className="studio-page studio-page-grid script-layout">
      <div className="studio-panel studio-script-panel">
        <div className="studio-section-title">
          <div>
            <span className="studio-panel-kicker">Step 01 · Script</span>
            <h2>先确认文稿，再设计网页</h2>
            <p>输入主题或素材后，只先生成可编辑文稿。用户确认文稿之前，不进入网页设计。</p>
          </div>
          {!activeProject && (
            <button className="studio-primary" disabled={loading} onClick={onCreate}>
              {loading ? "生成中..." : "生成文稿"}
            </button>
          )}
        </div>

        {!activeProject ? (
          <>
            <label>
              视频主题
              <input value={title} onChange={(e) => onSetTitle(e.target.value)} />
            </label>

            <label>
              素材 / 大纲 / 原始口播稿
              <textarea value={content} onChange={(e) => onSetContent(e.target.value)} />
            </label>

            <div className="studio-brief-footer">
              <div>
                <span>当前文稿生成方式</span>
                <strong>{scriptGeneratorLabel}</strong>
              </div>
              <div>
                <span>默认语音配置</span>
                <strong>
                  {settings?.values.WEB_VIDEO_TTS_PROVIDER || "检测中"} ·{" "}
                  {settings?.values.WEB_VIDEO_TTS_VOICE || "未设置音色"}
                </strong>
              </div>
            </div>
          </>
        ) : (
          <ScriptEditor
            chapters={draftChapters}
            dirty={draftDirty}
            disabled={loading}
            onApprove={onApproveScript}
            onChange={onChangeChapters}
            onSave={onSave}
            title={draftTitle}
            onTitleChange={onTitleChange}
          />
        )}
      </div>

      <aside className="studio-side">
        <ProjectSummary
          activeProject={activeProject}
          chapterCount={chapterCount}
          draftDirty={draftDirty}
          segmentStats={segmentStats}
          stepCount={stepCount}
        />
      </aside>
    </section>
  );
}

function ScriptEditor({
  chapters,
  dirty,
  disabled,
  onApprove,
  onChange,
  onSave,
  onTitleChange,
  title,
}: {
  chapters: GeneratedProject["chapters"];
  dirty: boolean;
  disabled: boolean;
  onApprove: () => void;
  onChange: (chapters: GeneratedProject["chapters"]) => void;
  onSave: () => void;
  onTitleChange: (value: string) => void;
  title: string;
}) {
  const updateStep = (chapterIndex: number, stepIndex: number, text: string) => {
    onChange(
      chapters.map((chapter, i) =>
        i === chapterIndex
          ? {
              ...chapter,
              narrations: chapter.steps.map((step, j) =>
                j === stepIndex ? text : chapter.narrations?.[j] || step,
              ),
            }
          : chapter,
      ),
    );
  };

  return (
    <div className="studio-script-editor">
      <div className="studio-script-toolbar">
        <div>
          <span>{chapters.length} 章 · {chapters.reduce((sum, chapter) => sum + chapter.steps.length, 0)} 段</span>
          {dirty && <strong>有未保存修改</strong>}
        </div>
        <div className="studio-actions compact">
          <button disabled={disabled || !dirty} onClick={onSave} type="button">
            保存文稿
          </button>
          <button className="is-primary" disabled={disabled} onClick={onApprove} type="button">
            确认文稿，进入分镜
          </button>
        </div>
      </div>

      <label>
        文稿标题
        <input disabled={disabled} value={title} onChange={(e) => onTitleChange(e.target.value)} />
      </label>

      <div className="studio-script-body">
        {chapters.map((chapter, chapterIndex) => (
          <section className="studio-script-chapter" key={chapter.id}>
            <div>
              <span className="studio-panel-kicker">Chapter {String(chapterIndex + 1).padStart(2, "0")}</span>
              <h3>{chapter.title}</h3>
            </div>
            {chapter.steps.map((step, stepIndex) => (
              <label className="studio-script-line" key={`${chapter.id}-${stepIndex}`}>
                <span>第 {stepIndex + 1} 段口播</span>
                <textarea
                  disabled={disabled}
                  value={chapter.narrations?.[stepIndex] || step}
                  onChange={(e) => updateStep(chapterIndex, stepIndex, e.target.value)}
                />
              </label>
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}

function StoryboardPage({
  activeProject,
  draftChapters,
  draftDirty,
  isBusy,
  loading,
  onApproveStoryboard,
  onChangeChapters,
  onSave,
  onSetPage,
}: {
  activeProject: GeneratedProject | null;
  draftChapters: GeneratedProject["chapters"];
  draftDirty: boolean;
  isBusy: boolean;
  loading: boolean;
  onApproveStoryboard: () => void;
  onChangeChapters: (chapters: GeneratedProject["chapters"]) => void;
  onSave: () => void;
  onSetPage: (page: StudioPage) => void;
}) {
  const disabled = loading || isBusy;
  const updateChapter = (
    chapterIndex: number,
    patch: Partial<GeneratedProject["chapters"][number]>,
  ) => {
    onChangeChapters(
      draftChapters.map((chapter, index) =>
        index === chapterIndex ? { ...chapter, ...patch } : chapter,
      ),
    );
  };
  const updateStep = (chapterIndex: number, stepIndex: number, text: string) => {
    onChangeChapters(
      draftChapters.map((chapter, index) =>
        index === chapterIndex
          ? updateChapterStepText(chapter, stepIndex, text)
          : chapter,
      ),
    );
  };

  if (!activeProject) {
    return (
      <section className="studio-page">
        <EmptyState
          title="还没有可拆分镜的文稿"
          body="先在文稿页生成并确认口播稿，再进入分镜。"
          actionLabel="去写文稿"
          onAction={() => onSetPage("script")}
        />
      </section>
    );
  }

  return (
    <section className="studio-page studio-storyboard-page">
      <div className="studio-panel">
        <div className="studio-section-title">
          <div>
            <span className="studio-panel-kicker">Step 02 · Storyboard</span>
            <h2>确认每一屏讲什么</h2>
            <p>分镜只负责节奏和信息密度。确认以后再生成网页视觉，不把设计问题提前塞给用户。</p>
          </div>
          <div className="studio-actions compact">
            <button disabled={disabled || !draftDirty} onClick={onSave} type="button">
              保存分镜
            </button>
            <button
              className="is-primary"
              disabled={disabled}
              onClick={onApproveStoryboard}
              type="button"
            >
              确认分镜，进入设计
            </button>
          </div>
        </div>

        <div className="studio-storyboard-list">
          {draftChapters.map((chapter, chapterIndex) => (
            <article className="studio-storyboard-chapter" key={chapter.id}>
              <div className="studio-storyboard-chapter-head">
                <span>{String(chapterIndex + 1).padStart(2, "0")}</span>
                <label>
                  章节标题
                  <input
                    disabled={disabled}
                    value={chapter.title}
                    onChange={(e) =>
                      updateChapter(chapterIndex, { title: e.target.value })
                    }
                  />
                </label>
                <strong>{chapter.steps.length} 屏</strong>
              </div>

              <div className="studio-storyboard-steps">
                {chapter.steps.map((step, stepIndex) => (
                  <label className="studio-storyboard-step" key={`${chapter.id}-${stepIndex}`}>
                    <span>屏幕 {stepIndex + 1} · 屏幕文案</span>
                    <textarea
                      disabled={disabled}
                      value={step}
                      onChange={(e) =>
                        updateStep(chapterIndex, stepIndex, e.target.value)
                      }
                    />
                  </label>
                ))}
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function DesignPage({
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
  const disabled = loading || isBusy;
  const flatSteps = flattenDraftSteps(draftChapters);
  const safeStep =
    flatSteps.length === 0
      ? 0
      : Math.min(Math.max(previewGlobalStep, 0), flatSteps.length - 1);
  const selected = flatSteps[safeStep];

  const updateChapter = (
    chapterIndex: number,
    patch: Partial<GeneratedProject["chapters"][number]>,
  ) => {
    onChangeChapters(
      draftChapters.map((chapter, index) =>
        index === chapterIndex ? { ...chapter, ...patch } : chapter,
      ),
    );
  };

  const updateScreenText = (value: string) => {
    if (!selected) return;
    onChangeChapters(
      draftChapters.map((chapter, chapterIndex) =>
        chapterIndex === selected.chapterIndex
          ? updateChapterStepText(chapter, selected.stepIndex, value)
          : chapter,
      ),
    );
  };

  const updateNarration = (value: string) => {
    if (!selected) return;
    onChangeChapters(
      draftChapters.map((chapter, chapterIndex) => {
        if (chapterIndex !== selected.chapterIndex) return chapter;
        const narrations = chapter.steps.map((step, index) =>
          index === selected.stepIndex ? value : chapter.narrations?.[index] || step,
        );
        return { ...chapter, narrations };
      }),
    );
  };

  const addStepAfterSelected = () => {
    if (!selected) return;
    onChangeChapters(
      draftChapters.map((chapter, chapterIndex) => {
        if (chapterIndex !== selected.chapterIndex) return chapter;
        const insertAt = selected.stepIndex + 1;
        const steps = [...chapter.steps];
        const narrations = chapter.steps.map(
          (step, index) => chapter.narrations?.[index] || step,
        );
        steps.splice(insertAt, 0, "新的屏幕文案");
        narrations.splice(insertAt, 0, "新的真实口播，可以比屏幕文案更完整。");
        return { ...chapter, steps, narrations };
      }),
    );
    onPreviewStep(safeStep + 1);
  };

  const removeSelectedStep = () => {
    if (!selected) return;
    onChangeChapters(
      draftChapters
        .map((chapter, chapterIndex) => {
          if (chapterIndex !== selected.chapterIndex) return chapter;
          return {
            ...chapter,
            steps: chapter.steps.filter((_, index) => index !== selected.stepIndex),
            narrations: chapter.steps
              .map((step, index) => chapter.narrations?.[index] || step)
              .filter((_, index) => index !== selected.stepIndex),
          };
        })
        .filter((chapter) => chapter.steps.length > 0),
    );
    onPreviewStep(Math.max(0, safeStep - 1));
  };

  return (
    <section className="studio-page studio-design-workspace">
      {!activeProject ? (
        <EmptyState
          title="还没有可设计的项目"
          body="先生成并确认文稿，再确认分镜，最后进入网页设计。"
          actionLabel="去写文稿"
          onAction={() => onSetPage("script")}
        />
      ) : (
        <>
          <aside className="studio-design-rail">
            <div className="studio-design-rail-head">
              <span className="studio-panel-kicker">Screen Map</span>
              <strong>{flatSteps.length} 屏</strong>
            </div>
            <div className="studio-design-step-list">
              {flatSteps.map((item) => (
                <button
                  className={item.globalStep === safeStep ? "is-active" : ""}
                  key={`${item.chapter.id}-${item.stepIndex}`}
                  onClick={() => onPreviewStep(item.globalStep)}
                  type="button"
                >
                  <span>{String(item.globalStep + 1).padStart(2, "0")}</span>
                  <strong>{item.screenText}</strong>
                  <em>{item.chapter.title}</em>
                </button>
              ))}
            </div>
          </aside>

          <div className="studio-panel studio-design-editor-panel">
            <div className="studio-section-title studio-design-title">
              <div>
                <span className="studio-panel-kicker">Step 03 · Design</span>
                <h2>只调整当前这一屏</h2>
                <p>屏幕文案负责画面重点，真实口播负责完整讲解；保存后右侧预览和音频合成都会使用最新内容。</p>
              </div>
              <div className="studio-actions compact">
                <button disabled={disabled || !draftDirty} onClick={onSave} type="button">
                  保存并刷新预览
                </button>
                <a href={previewUrl}>新窗口打开</a>
              </div>
            </div>

            <label className="studio-design-project-title">
              项目标题
              <input
                disabled={disabled}
                value={draftTitle}
                onChange={(event) => onTitleChange(event.target.value)}
              />
            </label>

            {selected && (
              <div className="studio-focus-editor">
                <div className="studio-focus-meta">
                  <span>第 {selected.globalStep + 1} 屏</span>
                  <label>
                    章节标题
                    <input
                      disabled={disabled}
                      value={selected.chapter.title}
                      onChange={(event) =>
                        updateChapter(selected.chapterIndex, {
                          title: event.target.value,
                        })
                      }
                    />
                  </label>
                </div>

                <label className="studio-focus-field">
                  <span>屏幕文案</span>
                  <textarea
                    disabled={disabled}
                    value={selected.screenText}
                    onChange={(event) => updateScreenText(event.target.value)}
                  />
                  <small>建议短一点，只放观众必须马上看懂的核心判断。</small>
                </label>

                <label className="studio-focus-field is-narration">
                  <span>真实口播</span>
                  <textarea
                    disabled={disabled}
                    value={selected.narration}
                    onChange={(event) => updateNarration(event.target.value)}
                  />
                  <small>这里可以讲得完整、通俗，并穿插例子；合成音频会读这一段。</small>
                </label>

                <div className="studio-focus-actions">
                  <button disabled={disabled} onClick={addStepAfterSelected} type="button">
                    在后面加一屏
                  </button>
                  <button
                    disabled={disabled || flatSteps.length <= 1}
                    onClick={removeSelectedStep}
                    type="button"
                  >
                    删除当前屏
                  </button>
                  {draftDirty && <span>有未保存修改</span>}
                </div>
              </div>
            )}
          </div>

          <aside className="studio-design-preview">
            <div className="studio-preview studio-side-section is-primary">
              <div className="studio-preview-head">
                <div>
                  <span className="studio-panel-kicker">Live Preview</span>
                  <h2>网页设计预览</h2>
                </div>
                <span>{flatSteps.length ? `${safeStep + 1} / ${flatSteps.length}` : "0 / 0"}</span>
              </div>
              <iframe
                src={previewFrameUrl}
                title="网页视频草稿预览"
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
  const canSynthesizeAudio = Boolean(health?.ttsConfigured);
  const canRenderVideo = Boolean(health?.chromeConfigured && health?.ffmpegConfigured);
  const localExecutionBlocked = health?.checks?.localExecution?.ok === false;
  const actionDisabled = !activeProject || loading || isBusy || draftDirty;

  return (
    <section className="studio-page studio-page-grid">
      {!activeProject ? (
        <EmptyState
          title="还没有打开项目"
          body="每次生成都会成为一个独立项目。先到项目历史打开一个项目，再回来合成音频或导出。"
          actionLabel="打开项目历史"
          onAction={() => onSetPage("projects")}
        />
      ) : (
        <>
          <div className="studio-panel">
            <div className="studio-section-title">
              <div>
                <span className="studio-panel-kicker">Step 04 · Export</span>
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
                当前内容有未保存修改。请回到“设计”保存后再生成产物。
              </div>
            )}
            {!canSynthesizeAudio && (
              <div className="studio-error">
                音频合成不可用：请到设置页选择可用的 TTS Provider。
                {localExecutionBlocked
                  ? " 当前后端不能启动本地命令，请用项目根目录的 start-local.bat 重新启动。"
                  : " 当前建议使用 OpenAI API 或 Windows 本地语音。"}
              </div>
            )}
            {localExecutionBlocked && (
              <div className="studio-dirty-note">
                本地语音、ffmpeg 和 MP4 导出都依赖后端能启动系统进程。当前检测为
                {health?.checks?.localExecution?.code || "Blocked"}：
                {health?.checks?.localExecution?.message}
              </div>
            )}
            {!canRenderVideo && (
              <div className="studio-dirty-note">
                MP4 导出还不可用：需要配置 Chrome 路径并安装 ffmpeg。你可以先合成音频或打开网页预览。
              </div>
            )}
            <div className="studio-actions large">
              <button
                disabled={actionDisabled || !canSynthesizeAudio}
                onClick={onSynthesize}
                type="button"
                >
                  {activeProject.audio?.length ? "重新合成音频" : "合成音频"}
                </button>
              <button
                disabled={actionDisabled || !canRenderVideo}
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

function ProjectsPage({
  activeProject,
  health,
  projects,
}: {
  activeProject: GeneratedProject | null;
  health: Health | null;
  projects: ProjectListItem[];
}) {
  const completed = projects.filter((project) => project.hasVideo).length;
  const withAudio = projects.filter((project) => project.hasAudio).length;

  return (
    <section className="studio-page studio-page-grid">
      <div className="studio-panel studio-project-dashboard">
        <div className="studio-section-title">
          <div>
            <span className="studio-panel-kicker">Project Hub</span>
            <h2>项目总览</h2>
            <p>左侧是项目库。选中任意项目后，这里会展示该项目状态和下一步动作。</p>
          </div>
        </div>
        <div className="studio-metrics">
          <Metric label="全部项目" value={projects.length} />
          <Metric label="已有音频" value={withAudio} />
          <Metric label="已有视频" value={completed} />
        </div>
        <ProjectSummary
          activeProject={activeProject}
          chapterCount={activeProject?.chapters.length || 0}
          draftDirty={false}
          segmentStats={
            activeProject
              ? `${activeProject.chapters.length} 章 / ${activeProject.segments.length} 屏`
              : "尚未选择"
          }
          stepCount={activeProject?.segments.length || 0}
        />
      </div>
      <aside className="studio-side">
        <RuntimePanel health={health} />
      </aside>
    </section>
  );
}

function SettingsPage({
  health,
  llmModels,
  llmTestState,
  loading,
  onClearStoredApiKey,
  onChangeSettings,
  onSaveSettings,
  onTestLlmSettings,
  onTestLocalTtsSettings,
  onTestTtsSettings,
  savedMessage,
  settings,
  settingsDraft,
  ttsTestState,
}: {
  health: Health | null;
  llmModels: LlmModelItem[];
  llmTestState: {
    tone: "idle" | "pending" | "success" | "error";
    message: string;
  };
  ttsTestState: {
    tone: "idle" | "pending" | "success" | "error";
    message: string;
  };
  loading: boolean;
  onClearStoredApiKey: () => void;
  onChangeSettings: (settings: StudioSettings["values"]) => void;
  onSaveSettings: () => void;
  onTestLlmSettings: () => void;
  onTestLocalTtsSettings: () => void;
  onTestTtsSettings: () => void;
  savedMessage: string;
  settings: StudioSettings | null;
  settingsDraft: StudioSettings["values"];
}) {
  const update = (key: keyof StudioSettings["values"], value: string) => {
    onChangeSettings({ ...settingsDraft, [key]: value });
  };
  const localExecution = health?.checks?.localExecution;
  const localExecutionBlocked = localExecution?.ok === false;

  return (
    <section className="studio-page studio-page-grid settings-layout">
      <div className="studio-panel studio-settings-panel">
        <div className="studio-section-title">
          <div>
            <span className="studio-panel-kicker">Backend Settings</span>
            <h2>AI 生成与导出配置</h2>
            <p>这里保存的是后端 `.env` 配置。API Key 不会回显，留空表示保持原值。</p>
          </div>
          <button className="studio-primary" disabled={loading} onClick={onSaveSettings}>
            {loading ? "保存中..." : "保存设置"}
          </button>
        </div>

        {savedMessage && <div className="studio-success">{savedMessage}</div>}

        <div className="studio-settings-overview">
          <article>
            <span>文稿模型</span>
            <strong>{settingsDraft.WEB_VIDEO_LLM_MODEL || "未选择模型"}</strong>
            <em>{settingsDraft.WEB_VIDEO_SCRIPT_PROVIDER}</em>
          </article>
          <article>
            <span>API Key</span>
            <strong>{settings?.secrets.OPENAI_API_KEY ? "后端已保存" : "未保存"}</strong>
            <em>{settingsDraft.OPENAI_BASE_URL || "未设置 Base URL"}</em>
          </article>
          <article>
            <span>语音</span>
            <strong>{settingsDraft.WEB_VIDEO_TTS_PROVIDER}</strong>
            <em>{settingsDraft.WEB_VIDEO_TTS_VOICE || "未选择音色"}</em>
          </article>
          <article>
            <span>导出</span>
            <strong>{health?.chromeConfigured ? "Chrome Ready" : "需配置 Chrome"}</strong>
            <em>{health?.ffmpegConfigured ? "ffmpeg Ready" : "需检测 ffmpeg"}</em>
          </article>
        </div>

        <section className="studio-settings-group">
          <div>
            <span className="studio-panel-kicker">Script LLM</span>
            <h3>大模型文稿生成</h3>
          </div>
          <div className="studio-grid">
            <label>
              文稿生成模式
              <select
                value={settingsDraft.WEB_VIDEO_SCRIPT_PROVIDER}
                onChange={(event) =>
                  update("WEB_VIDEO_SCRIPT_PROVIDER", event.target.value)
                }
              >
                <option value="llm-required">必须调用大模型，失败就报错</option>
                <option value="llm-auto">优先大模型，失败后本地兜底</option>
                <option value="local">只用本地规则草稿</option>
              </select>
            </label>
            <label>
              文稿模型
              <select
                value={settingsDraft.WEB_VIDEO_LLM_MODEL}
                onChange={(event) => update("WEB_VIDEO_LLM_MODEL", event.target.value)}
              >
                {settingsDraft.WEB_VIDEO_LLM_MODEL && (
                  <option value={settingsDraft.WEB_VIDEO_LLM_MODEL}>
                    {settingsDraft.WEB_VIDEO_LLM_MODEL}
                  </option>
                )}
                {!settingsDraft.WEB_VIDEO_LLM_MODEL && (
                  <option value="">先测试接口加载模型</option>
                )}
                {llmModels
                  .filter((model) => model.id !== settingsDraft.WEB_VIDEO_LLM_MODEL)
                  .map((model) => (
                    <option value={model.id} key={model.id}>
                      {model.id}
                      {model.ownedBy ? ` · ${model.ownedBy}` : ""}
                    </option>
                  ))}
              </select>
            </label>
          </div>
          <div className="studio-grid">
            <label>
              OpenAI-Compatible Base URL
              <input
                value={settingsDraft.OPENAI_BASE_URL}
                onChange={(event) => update("OPENAI_BASE_URL", event.target.value)}
              />
            </label>
            <label>
              文稿请求超时 ms
              <input
                value={settingsDraft.WEB_VIDEO_LLM_TIMEOUT_MS}
                onChange={(event) =>
                  update("WEB_VIDEO_LLM_TIMEOUT_MS", event.target.value)
                }
              />
            </label>
          </div>
          <div className="studio-secret-field">
            <label>
              API Key
              <input
                placeholder={
                  settings?.secrets.OPENAI_API_KEY
                    ? "已保存，出于安全不回显；输入新 key 才会替换"
                    : "sk-..."
                }
                type="password"
                value={settingsDraft.OPENAI_API_KEY}
                onChange={(event) => update("OPENAI_API_KEY", event.target.value)}
              />
            </label>
            <div className="studio-secret-status">
              <span
                className={
                  settings?.secrets.OPENAI_API_KEY
                    ? "studio-secret-badge is-saved"
                    : "studio-secret-badge"
                }
              >
                {settings?.secrets.OPENAI_API_KEY
                  ? "后端已保存 API Key"
                  : "后端尚未保存 API Key"}
              </span>
              <span>
                刷新后不会显示明文；留空保存会保持原 Key，输入新 Key 会替换。
              </span>
              <button
                disabled={loading || !settings?.secrets.OPENAI_API_KEY}
                onClick={onClearStoredApiKey}
                type="button"
              >
                清除已保存 Key
              </button>
            </div>
          </div>
          <div className="studio-llm-test-row">
            <button disabled={loading} onClick={onTestLlmSettings} type="button">
              {loading ? "测试中..." : "测试 API 并加载模型"}
            </button>
            <label>
              手动填写模型
              <input
                placeholder="下拉框没有时可手动输入模型 ID"
                value={settingsDraft.WEB_VIDEO_LLM_MODEL}
                onChange={(event) =>
                  update("WEB_VIDEO_LLM_MODEL", event.target.value)
                }
              />
            </label>
          </div>
          {llmTestState.message && (
            <div className={`studio-llm-result is-${llmTestState.tone}`}>
              <strong>
                {llmTestState.tone === "success"
                  ? "测试通过"
                  : llmTestState.tone === "error"
                    ? "测试失败"
                    : "正在测试"}
              </strong>
              <span>{llmTestState.message}</span>
            </div>
          )}
          <div className="studio-note inline">
            文稿生成会真实请求 <code>Base URL + /chat/completions</code>。
            点击测试会请求 <code>Base URL + /models</code>，加载模型并自动保存当前 API 配置。
            API Key 刷新后不会回显，但右侧显示“已配置”就代表后端已保存。
          </div>
        </section>

        <section className="studio-settings-group">
          <div>
            <span className="studio-panel-kicker">TTS</span>
            <h3>语音合成接口</h3>
          </div>
          <div className="studio-grid">
            <label>
              默认 TTS Provider
              <select
                value={settingsDraft.WEB_VIDEO_TTS_PROVIDER}
                onChange={(event) =>
                  update("WEB_VIDEO_TTS_PROVIDER", event.target.value)
                }
              >
                <option value="windows-sapi">Windows 本地语音（离线）</option>
                <option value="edge-tts">edge-tts 本地命令</option>
                <option value="openai">OpenAI API</option>
                <option value="say">macOS say 离线</option>
                <option value="piper">Piper 本地模型</option>
              </select>
            </label>
            <label>
              默认音色
              {settingsDraft.WEB_VIDEO_TTS_PROVIDER === "windows-sapi" &&
              health?.checks?.tts?.windowsSapiVoices?.length ? (
                <select
                  value={settingsDraft.WEB_VIDEO_TTS_VOICE}
                  onChange={(event) =>
                    update("WEB_VIDEO_TTS_VOICE", event.target.value)
                  }
                >
                  {health.checks.tts.windowsSapiVoices.map((voiceName) => (
                    <option value={voiceName} key={voiceName}>
                      {voiceName}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  value={settingsDraft.WEB_VIDEO_TTS_VOICE}
                  onChange={(event) =>
                    update("WEB_VIDEO_TTS_VOICE", event.target.value)
                  }
                />
              )}
            </label>
          </div>
          <div className="studio-grid studio-range-grid">
            <label>
              语速 {settingsDraft.WEB_VIDEO_TTS_RATE}
              <input
                max="10"
                min="-10"
                step="1"
                type="range"
                value={settingsDraft.WEB_VIDEO_TTS_RATE}
                onChange={(event) => update("WEB_VIDEO_TTS_RATE", event.target.value)}
              />
            </label>
            <label>
              音量 {settingsDraft.WEB_VIDEO_TTS_VOLUME}%
              <input
                max="100"
                min="0"
                step="5"
                type="range"
                value={settingsDraft.WEB_VIDEO_TTS_VOLUME}
                onChange={(event) =>
                  update("WEB_VIDEO_TTS_VOLUME", event.target.value)
                }
              />
            </label>
          </div>
          <div className="studio-llm-test-row">
            <button disabled={loading} onClick={onTestLocalTtsSettings} type="button">
              {loading ? "测试中..." : "测试本地 TTS"}
            </button>
            <label>
              音频格式
              <select
                value={settingsDraft.WEB_VIDEO_TTS_FORMAT}
                onChange={(event) => update("WEB_VIDEO_TTS_FORMAT", event.target.value)}
              >
                <option value="mp3">MP3（推荐，网页/导出通用）</option>
                <option value="wav">WAV（本地原始音频）</option>
              </select>
            </label>
          </div>
          <div className="studio-note inline">
            Windows 本地语音完全离线，支持换系统声音、语速和音量。Piper 需要另外安装可执行文件和中文模型。
          </div>
          {localExecutionBlocked && (
            <div className="studio-llm-result is-error">
              <strong>本地执行受限</strong>
              <span>
                {localExecution.message}
                {" "}如果你要用 Windows 本地语音，请关闭当前前后端窗口，然后双击项目根目录的
                <code> start-local.bat </code>
                重新启动。
              </span>
            </div>
          )}
          <label>
            OpenAI TTS Base URL
            <input
              placeholder="留空则复用上方大模型 Base URL；不支持语音时请单独填写"
              value={settingsDraft.OPENAI_TTS_BASE_URL}
              onChange={(event) => update("OPENAI_TTS_BASE_URL", event.target.value)}
            />
          </label>
          <label>
            OpenAI TTS Model
            <input
              value={settingsDraft.OPENAI_TTS_MODEL}
              onChange={(event) => update("OPENAI_TTS_MODEL", event.target.value)}
            />
          </label>
          <div className="studio-llm-test-row">
            <button disabled={loading} onClick={onTestTtsSettings} type="button">
              {loading ? "测试中..." : "测试 OpenAI TTS"}
            </button>
            <div className="studio-note inline">
              这会真实请求 <code>OpenAI TTS Base URL + /audio/speech</code>。
              文稿 API 可用不代表语音 API 可用，很多中转只支持聊天模型。
            </div>
          </div>
          {ttsTestState.message && (
            <div className={`studio-llm-result is-${ttsTestState.tone}`}>
              <strong>
                {ttsTestState.tone === "success"
                  ? "TTS 测试通过"
                  : ttsTestState.tone === "error"
                    ? "TTS 测试失败"
                    : "正在测试"}
              </strong>
              <span>{ttsTestState.message}</span>
            </div>
          )}
        </section>

        <section className="studio-settings-group">
          <div>
            <span className="studio-panel-kicker">Rendering</span>
            <h3>网页预览与 MP4 导出</h3>
          </div>
          <label>
            渲染访问 URL
            <input
              value={settingsDraft.WEB_VIDEO_RENDER_BASE_URL}
              onChange={(event) =>
                update("WEB_VIDEO_RENDER_BASE_URL", event.target.value)
              }
            />
          </label>
          <label>
            Chrome 路径
            <input
              placeholder="例如 C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
              value={settingsDraft.WEB_VIDEO_CHROME_PATH}
              onChange={(event) =>
                update("WEB_VIDEO_CHROME_PATH", event.target.value)
              }
            />
          </label>
          <div className="studio-grid">
            <label>
              FPS
              <input
                value={settingsDraft.WEB_VIDEO_RENDER_FPS}
                onChange={(event) =>
                  update("WEB_VIDEO_RENDER_FPS", event.target.value)
                }
              />
            </label>
            <label>
              等待动画稳定 ms
              <input
                value={settingsDraft.WEB_VIDEO_RENDER_SETTLE_MS}
                onChange={(event) =>
                  update("WEB_VIDEO_RENDER_SETTLE_MS", event.target.value)
                }
              />
            </label>
          </div>
        </section>

        <section className="studio-settings-group">
          <div>
            <span className="studio-panel-kicker">Fallback / Local</span>
            <h3>本地与兜底语音</h3>
          </div>
          <div className="studio-grid">
            <label>
              TTS 失败兜底
              <input
                value={settingsDraft.WEB_VIDEO_TTS_FALLBACK}
                onChange={(event) =>
                  update("WEB_VIDEO_TTS_FALLBACK", event.target.value)
                }
              />
            </label>
            <label>
              兜底音色
              <input
                value={settingsDraft.WEB_VIDEO_TTS_FALLBACK_VOICE}
                onChange={(event) =>
                  update("WEB_VIDEO_TTS_FALLBACK_VOICE", event.target.value)
                }
              />
            </label>
          </div>
          <div className="studio-grid">
            <label>
              Piper 可执行文件
              <input
                value={settingsDraft.PIPER_BIN}
                onChange={(event) => update("PIPER_BIN", event.target.value)}
              />
            </label>
            <label>
              Piper 模型路径
              <input
                value={settingsDraft.PIPER_MODEL}
                onChange={(event) => update("PIPER_MODEL", event.target.value)}
              />
            </label>
          </div>
        </section>
      </div>

      <aside className="studio-side settings-runtime">
        <RuntimePanel health={health} />
        <div className="studio-note">
          API key、Base URL、TTS provider 和渲染 URL 都在这里落到后端{" "}
          <code>.env</code>。改完设置后，新的项目生成、音频合成和 MP4 导出会读取这些值。
        </div>
      </aside>
    </section>
  );
}

function cloneDraft(project: GeneratedProject) {
  const narrationByStep = new Map(
    project.segments.map((segment) => [
      `${segment.chapter}:${segment.step}`,
      segment.narration || segment.text,
    ]),
  );
  return project.chapters.map((chapter) => ({
    ...chapter,
    steps: [...chapter.steps],
    narrations: chapter.steps.map((step, index) =>
      chapter.narrations?.[index] ||
      narrationByStep.get(`${chapter.id}:${index + 1}`) ||
      step,
    ),
  }));
}

function updateChapterStepText(
  chapter: GeneratedProject["chapters"][number],
  stepIndex: number,
  text: string,
) {
  const previousStep = chapter.steps[stepIndex] || "";
  const steps = chapter.steps.map((step, index) =>
    index === stepIndex ? text : step,
  );
  const narrations = steps.map((step, index) => {
    const existing = chapter.narrations?.[index];
    if (index !== stepIndex) return existing || chapter.steps[index] || step;
    return !existing || existing === previousStep ? text : existing;
  });
  return { ...chapter, steps, narrations };
}

function flattenDraftSteps(chapters: GeneratedProject["chapters"]) {
  let globalStep = 0;
  return chapters.flatMap((chapter, chapterIndex) =>
    chapter.steps.map((screenText, stepIndex) => ({
      chapter,
      chapterIndex,
      globalStep: globalStep++,
      narration: chapter.narrations?.[stepIndex] || screenText,
      screenText,
      stepIndex,
    })),
  );
}

function getScriptGeneratorLabel(settings: StudioSettings | null) {
  const values = settings?.values;
  if (!values) return "检测中";
  if (values.WEB_VIDEO_SCRIPT_PROVIDER === "local") return "本地规则草稿";
  const mode =
    values.WEB_VIDEO_SCRIPT_PROVIDER === "llm-auto"
      ? "大模型优先，失败本地兜底"
      : "必须调用大模型";
  return `${mode} · ${values.WEB_VIDEO_LLM_MODEL || "未设置模型"}`;
}

function getInitialStudioPage(): StudioPage {
  try {
    const stored = window.localStorage.getItem(STUDIO_ACTIVE_PAGE_KEY);
    if (STUDIO_PAGES.includes(stored as StudioPage)) {
      return stored as StudioPage;
    }
  } catch {
    return "script";
  }
  return "script";
}

function ensureDraftSaved(
  draftDirty: boolean,
  setError: (message: string) => void,
) {
  if (!draftDirty) return true;
  setError("当前草稿有未保存修改。请先保存并刷新预览，再合成音频或导出 MP4。");
  return false;
}

function sleep(ms: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}
