import type { ChapterDef } from "../registry/types";
import { GeneratedChapterView } from "./GeneratedChapter";
import type { GeneratedProject, RuntimeProject } from "./types";

export function buildRuntimeProject(project: GeneratedProject): RuntimeProject {
  const chapters: ChapterDef[] = project.chapters.map((chapter, index) => ({
    id: chapter.id,
    title: chapter.title,
    narrations: chapter.steps,
    Component: (props) => (
      <GeneratedChapterView {...props} chapter={chapter} index={index} />
    ),
  }));
  return {
    id: project.id,
    title: project.title,
    chapters,
    audioBasePath: `storage/projects/${project.id}/audio`,
  };
}
