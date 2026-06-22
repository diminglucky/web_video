import type { GeneratedProject } from "../generated/types";

export function DraftEditor({
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
        return updateChapterStepText(chapter, stepIndex, text);
      }),
    );
  };

  const updateNarration = (
    chapterIndex: number,
    stepIndex: number,
    text: string,
  ) => {
    onChange(
      chapters.map((chapter, i) => {
        if (i !== chapterIndex) return chapter;
        const narrations = chapter.steps.map((step, index) => {
          if (index === stepIndex) return text;
          return chapter.narrations?.[index] || step;
        });
        return { ...chapter, narrations };
      }),
    );
  };

  const addStep = (chapterIndex: number) => {
    onChange(
      chapters.map((chapter, i) =>
        i === chapterIndex
          ? {
              ...chapter,
              steps: [...chapter.steps, "新的屏幕文案"],
              narrations: [
                ...(chapter.narrations || chapter.steps),
                "新的屏幕文案",
              ],
            }
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
            narrations: (chapter.narrations || chapter.steps).filter(
              (_, j) => j !== stepIndex,
            ),
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
        <button disabled={disabled} onClick={onSave} type="button">
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
                <span>第 {stepIndex + 1} 屏 · 屏幕文案</span>
                <textarea
                  disabled={disabled}
                  value={step}
                  onChange={(event) =>
                    updateStep(chapterIndex, stepIndex, event.target.value)
                  }
                />
                <div className="studio-step-narration">
                  <div className="studio-step-narration-head">
                    <strong>真实口播</strong>
                    <em>会用于合成音频</em>
                  </div>
                  <textarea
                    disabled={disabled}
                    value={chapter.narrations?.[stepIndex] || step}
                    onChange={(event) =>
                      updateNarration(chapterIndex, stepIndex, event.target.value)
                    }
                  />
                  <small>修改后先保存草稿；如果已经生成过音频，需要重新合成才会听到新口播。</small>
                </div>
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

export function ChapterPreviewNav({
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
