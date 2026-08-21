const MIN_CHAPTERS = 5;
const MIN_STEPS = 15;
const MIN_NARRATION_CHARS = 150;
const MAX_NARRATION_CHARS = 420;

const EXAMPLE_PATTERN = /(比如|例如|举例|假设|好比|场景)/u;
const BOUNDARY_PATTERN = /(边界|风险|限制|不能|不适合|误区|确认|前提)/u;
const MECHANISM_PATTERN = /(因为|通过|先.*再|步骤|流程|输入|结果|机制|运转)/u;

export function assessTeachingQuality(project) {
  const chapters = Array.isArray(project?.chapters) ? project.chapters : [];
  const narrations = chapters.flatMap((chapter) =>
    (Array.isArray(chapter?.narrations) ? chapter.narrations : []).map((text) => String(text || "").trim()),
  );
  const texts = narrations.join(" ");
  const issues = [];
  const warnings = [];

  if (chapters.length < MIN_CHAPTERS) {
    issues.push(`章节数不足：至少需要 ${MIN_CHAPTERS} 章。`);
  }
  if (narrations.length < MIN_STEPS) {
    issues.push(`屏数不足：至少需要 ${MIN_STEPS} 屏。`);
  }

  const shortSteps = narrations
    .map((text, index) => ({ index: index + 1, length: text.length }))
    .filter(({ length }) => length < MIN_NARRATION_CHARS);
  if (shortSteps.length) {
    issues.push(
      `${shortSteps.length} 屏口播过短：每屏至少 ${MIN_NARRATION_CHARS} 字，问题屏为 ${shortSteps
        .slice(0, 6)
        .map(({ index, length }) => `${index}(${length}字)`)
        .join("、")}。`,
    );
  }

  const longSteps = narrations.filter((text) => text.length > MAX_NARRATION_CHARS).length;
  if (longSteps) warnings.push(`${longSteps} 屏口播超过 ${MAX_NARRATION_CHARS} 字，可能需要拆屏。`);
  if (!EXAMPLE_PATTERN.test(texts)) issues.push("缺少具体例子或类比。" );
  if (!BOUNDARY_PATTERN.test(texts)) issues.push("缺少边界、误区或风险说明。" );
  if (!MECHANISM_PATTERN.test(texts)) issues.push("缺少工作机制或因果链路说明。" );

  return {
    ok: issues.length === 0,
    issues,
    warnings,
    metrics: {
      chapters: chapters.length,
      steps: narrations.length,
      minNarrationChars: narrations.length ? Math.min(...narrations.map((text) => text.length)) : 0,
      maxNarrationChars: narrations.length ? Math.max(...narrations.map((text) => text.length)) : 0,
      exampleCount: (texts.match(EXAMPLE_PATTERN) || []).length,
      hasBoundary: BOUNDARY_PATTERN.test(texts),
      hasMechanism: MECHANISM_PATTERN.test(texts),
    },
  };
}

export function assertTeachingQuality(project) {
  const quality = assessTeachingQuality(project);
  if (!quality.ok) {
    const error = new Error(`文稿质量未达标：${quality.issues.join(" ")}`);
    error.code = "SCRIPT_QUALITY_FAILED";
    error.status = 422;
    error.quality = quality;
    throw error;
  }
  return quality;
}
