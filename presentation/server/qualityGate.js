const MIN_CHAPTERS = 5;
const MIN_STEPS = 15;
const MIN_NARRATION_CHARS = 150;
const MAX_NARRATION_CHARS = 420;
const MIN_DISTINCT_NARRATION_CHARS = 220;

const EXAMPLE_PATTERN = /(比如|例如|举例|假设|好比|场景)/u;
const BOUNDARY_PATTERN = /(边界|风险|限制|不能|不适合|误区|确认|前提)/u;
const MECHANISM_PATTERN = /(因为|通过|先.*再|步骤|流程|输入|结果|机制|运转)/u;

export function assessTeachingQuality(project) {
  const chapters = Array.isArray(project?.chapters) ? project.chapters : [];
  const narrations = chapters.flatMap((chapter) =>
    (Array.isArray(chapter?.narrations) ? chapter.narrations : []).map((text) => String(text || "").trim()),
  );
  const screens = chapters.flatMap((chapter) =>
    (Array.isArray(chapter?.steps) ? chapter.steps : []).map((text) => String(text || "").trim()),
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

  const duplicateScreens = countDuplicateValues(screens);
  if (duplicateScreens > 0) {
    issues.push(`屏幕文案重复：有 ${duplicateScreens} 屏与前面完全相同，生成内容没有推进。`);
  }

  const repeatedNarrations = countRepeatedNarrations(narrations);
  if (repeatedNarrations > 0) {
    issues.push(`口播内容重复：有 ${repeatedNarrations} 对相邻口播高度相似，需要重新展开本屏的新信息。`);
  }

  const distinctShortSteps = narrations
    .map((text, index) => ({ index: index + 1, length: text.length }))
    .filter(({ length }) => length < MIN_DISTINCT_NARRATION_CHARS);
  if (distinctShortSteps.length > Math.floor(narrations.length / 3)) {
    issues.push(`讲解信息量偏薄：${distinctShortSteps.length} 屏低于建议的 ${MIN_DISTINCT_NARRATION_CHARS} 字，无法支撑完整教学。`);
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
      duplicateScreens,
      repeatedNarrations,
      distinctShortSteps: distinctShortSteps.length,
    },
  };
}

function countDuplicateValues(values) {
  const seen = new Set();
  let count = 0;
  for (const value of values) {
    const normalized = value.replace(/[\s，。！？、：；,.!?;:]+/gu, "");
    if (!normalized) continue;
    if (seen.has(normalized)) count += 1;
    seen.add(normalized);
  }
  return count;
}

function countRepeatedNarrations(values) {
  let count = 0;
  for (let index = 1; index < values.length; index += 1) {
    const previous = values[index - 1];
    const current = values[index];
    if (previous.length < 180 || current.length < 180) continue;
    if (textSimilarity(previous, current) >= 0.9) count += 1;
  }
  return count;
}

function textSimilarity(left, right) {
  const leftParts = new Set(splitText(left));
  const rightParts = new Set(splitText(right));
  const intersection = [...leftParts].filter((part) => rightParts.has(part)).length;
  const smaller = Math.min(leftParts.size, rightParts.size);
  const lengthRatio = Math.min(left.length, right.length) / Math.max(left.length, right.length);
  return smaller ? (intersection / smaller) * 0.75 + lengthRatio * 0.25 : 0;
}

function splitText(value) {
  return String(value)
    .replace(/[，。！？、：；,.!?;:\s]+/gu, "|")
    .split("|")
    .map((part) => part.trim())
    .filter((part) => part.length >= 2);
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
