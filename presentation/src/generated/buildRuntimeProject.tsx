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
  const projectCase = hasContinuityData(project) ? inferProjectCase(project) : undefined;
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
        projectCase={projectCase}
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

function inferProjectCase(project: GeneratedProject) {
  const text = [
    project.title,
    project.content,
    ...project.chapters.flatMap((chapter) => [chapter.title, ...chapter.steps]),
  ].join(" ");
  if (/(贯穿案例|主线案例)[^。！？]{0,24}(旅行|航班|酒店|行程)/u.test(text)) {
    return "一次旅行规划";
  }
  const candidates: Array<[string, RegExp]> = [
    ["一次旅行规划", /(旅行|航班|酒店|行程|预算)/gu],
    ["客服问题处理", /(客服|订单|工单|退款|分流)/gu],
    ["一次代码修改", /(开发|编码|代码|测试|报错|修正)/gu],
    ["一项办公任务", /(办公|会议|邮件|周报|项目)/gu],
  ];
  const ranked: Array<[string, number]> = candidates
    .map(([name, pattern]) => [name, (text.match(pattern) || []).length] as [string, number])
    .sort((a, b) => b[1] - a[1]);
  if (ranked[0][1] > 0) return ranked[0][0];
  return "一个真实任务";
}

function hasContinuityData(project: GeneratedProject) {
  return project.chapters.some((chapter) =>
    chapter.visuals?.some((visual) => visual.continuity?.case),
  );
}

function sanitizeText(value: unknown) {
  let text = String(value || "").replace(/\s+/g, " ").trim();
  for (const pattern of META_FILLER_PATTERNS) {
    text = text.replace(pattern, "");
  }
  return text.replace(/\s+/g, " ").trim();
}
