import type { ChapterDef } from "../registry/types";
import { GeneratedChapterView } from "./GeneratedChapter";
import type { GeneratedProject, RuntimeProject } from "./types";

const META_FILLER_PATTERNS = [
  /这部分需要(?:听众|观众)理解背后的原因，而不只是(?:看见|看到)屏幕上的一[段句]话。?/gu,
  /这(?:一屏|一页|部分)需要(?:让)?(?:听众|观众)(?:真正)?理解(?:背后|其中)的(?:原因|逻辑|含义)，?而不只是(?:看见|看到|阅读)屏幕上的(?:一[段句]话|文字|短句)。?/gu,
  /(?:这(?:一屏|一页)|这里)(?:真正)?要(?:强调|说明)的是[:：]\s*/gu,
];

export function buildRuntimeProject(project: GeneratedProject): RuntimeProject {
  const audioByStep = Object.fromEntries(
    project.segments.map((segment) => [
      `${segment.chapter}:${segment.step}`,
      segment.audio,
    ]),
  );
  const narrationByStep = new Map(
    project.segments.map((segment) => [
      `${segment.chapter}:${segment.step}`,
      segment.narration || segment.text,
    ]),
  );
  const chapters: ChapterDef[] = project.chapters.map((chapter, index) => ({
    id: chapter.id,
    title: chapter.title,
    narrations: chapter.steps.map((step, stepIndex) =>
      sanitizeText(narrationByStep.get(`${chapter.id}:${stepIndex + 1}`) || step),
    ),
    Component: (props) => (
      <GeneratedChapterView
        {...props}
        chapter={chapter}
        index={index}
        projectTitle={project.title}
      />
    ),
  }));
  return {
    id: project.id,
    title: project.title,
    chapters,
    audioBasePath: `storage/projects/${project.id}/audio`,
    audioByStep,
  };
}

function sanitizeText(value: unknown) {
  let text = String(value || "").replace(/\s+/g, " ").trim();
  for (const pattern of META_FILLER_PATTERNS) {
    text = text.replace(pattern, "");
  }
  return text.replace(/\s+/g, " ").trim();
}
