import type { ChapterDef } from "./types";
import ColdopenChapter from "../chapters/01-coldopen/Coldopen";
import { narrations as coldopenNarrations } from "../chapters/01-coldopen/narrations";
import CorePartsChapter from "../chapters/02-core-parts/CoreParts";
import { narrations as corePartsNarrations } from "../chapters/02-core-parts/narrations";
import NotMagicChapter from "../chapters/03-not-magic/NotMagic";
import { narrations as notMagicNarrations } from "../chapters/03-not-magic/narrations";
import WorkChainChapter from "../chapters/04-work-chain/WorkChain";
import { narrations as workChainNarrations } from "../chapters/04-work-chain/narrations";
import UseCasesAndLimitsChapter from "../chapters/05-use-cases-and-limits/UseCasesAndLimits";
import { narrations as useCasesAndLimitsNarrations } from "../chapters/05-use-cases-and-limits/narrations";
import TakeawayChapter from "../chapters/06-takeaway/Takeaway";
import { narrations as takeawayNarrations } from "../chapters/06-takeaway/narrations";

/**
 * Order = order of presentation.
 *
 * Each chapter MUST provide a `narrations: Narration[]` array. Its length
 * is the chapter's step count — there is no `totalSteps` to maintain
 * separately. This guarantees the audio synthesis pipeline, the runtime
 * stepper, and the chapter `.tsx` switch on `step` cannot drift apart.
 *
 * Visual styling (color, fonts) comes entirely from the active theme —
 * chapters never hard-code palette / font names. See THEMES.md.
 */
export const CHAPTERS: ChapterDef[] = [
  {
    id: "coldopen",
    title: "先把聊天和执行分开",
    narrations: coldopenNarrations,
    Component: ColdopenChapter,
  },
  {
    id: "core-parts",
    title: "一个 Agent 由什么组成",
    narrations: corePartsNarrations,
    Component: CorePartsChapter,
  },
  {
    id: "not-magic",
    title: "它不是科幻，是系统",
    narrations: notMagicNarrations,
    Component: NotMagicChapter,
  },
  {
    id: "work-chain",
    title: "它真实做事时长什么样",
    narrations: workChainNarrations,
    Component: WorkChainChapter,
  },
  {
    id: "use-cases-and-limits",
    title: "能做什么，也会翻车",
    narrations: useCasesAndLimitsNarrations,
    Component: UseCasesAndLimitsChapter,
  },
  {
    id: "takeaway",
    title: "用三问判断靠不靠谱",
    narrations: takeawayNarrations,
    Component: TakeawayChapter,
  },
];
