const META_FILLER_PATTERNS = [
  /这部分需要(?:听众|观众)理解背后的原因，而不只是(?:看见|看到)屏幕上的一[段句]话。?/gu,
  /这(?:一屏|一页|部分)需要(?:让)?(?:听众|观众)(?:真正)?理解(?:背后|其中)的(?:原因|逻辑|含义)，?而不只是(?:看见|看到|阅读)屏幕上的(?:一[段句]话|文字|短句)。?/gu,
  /(?:这(?:一屏|一页)|这里)(?:真正)?要(?:强调|说明)的是[:：]\s*/gu,
];

const AWKWARD_TRANSITIONS = [
  [/比如，但如果/gu, "如果"],
  [/最后，所以，/gu, "最后，"],
  [/最后，所以/gu, "最后"],
  [/这样，更重要的是，/gu, "更重要的是，"],
  [/然后，在([^，。！？；]{2,24})里，/gu, "在$1里，"],
];

export function sanitizeGeneratedText(value) {
  let text = clean(value);
  for (const pattern of META_FILLER_PATTERNS) {
    text = text.replace(pattern, "");
  }
  for (const [pattern, replacement] of AWKWARD_TRANSITIONS) {
    text = text.replace(pattern, replacement);
  }
  return reduceRepeatedContext(text)
    .replace(/\s+([。！？；，、])/gu, "$1")
    .replace(/([。！？；，、]){2,}/gu, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

export function sanitizeGeneratedContent(value) {
  return String(value || "")
    .replace(/\r/g, "")
    .split(/\n---\n/g)
    .map(sanitizeGeneratedText)
    .filter(Boolean)
    .join("\n---\n");
}

export function sanitizeGeneratedProject(project) {
  if (!project || typeof project !== "object") return project;
  const next = {
    ...project,
    title: clean(project.title),
    content: sanitizeGeneratedContent(project.content),
  };

  if (Array.isArray(project.chapters)) {
    next.chapters = project.chapters.map((chapter) => ({
      ...chapter,
      title: clean(chapter?.title),
      steps: Array.isArray(chapter?.steps)
        ? chapter.steps.map(sanitizeGeneratedText).filter(Boolean)
        : [],
      narrations: Array.isArray(chapter?.narrations)
        ? chapter.narrations.map(sanitizeGeneratedText)
        : undefined,
    }));
  }

  if (Array.isArray(project.segments)) {
    next.segments = project.segments.map((segment) => ({
      ...segment,
      text: sanitizeGeneratedText(segment?.text),
      narration: sanitizeGeneratedText(segment?.narration || segment?.text),
    }));
  }

  return next;
}

function clean(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function reduceRepeatedContext(value) {
  const parts = String(value || "").match(/[^。！？；]+[。！？；]?/gu) || [];
  const result = [];
  for (const rawPart of parts) {
    let part = rawPart.trim();
    if (!part) continue;
    const previousText = result.join("");
    part = part.replace(
      /^(比如，?)在([^，。！？；]{2,24})里，/u,
      (match, prefix, context) =>
        previousText.includes(`在${context}里`) ? `${prefix}` : match,
    );
    part = part.replace(
      /^(关键是，?)在([^，。！？；]{2,24})里，/u,
      (match, prefix, context) =>
        previousText.includes(`在${context}里`) ? `${prefix}` : match,
    );
    result.push(part);
  }
  return result.join("");
}
