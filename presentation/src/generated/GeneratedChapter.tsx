import type { ChapterStepProps } from "../registry/types";
import type { GeneratedChapter } from "./types";
import "./GeneratedChapter.css";

interface Props extends ChapterStepProps {
  chapter: GeneratedChapter;
  index: number;
}

export function GeneratedChapterView({ chapter, index, step }: Props) {
  const current = chapter.steps[step] || "";
  const tokens = summarize(current);
  return (
    <section className="gen-scene scene-pad">
      <div className="gen-meta mono">
        PROJECT CHAPTER / {String(index + 1).padStart(2, "0")}
      </div>
      <div className="gen-layout">
        <div className="gen-copy">
          <div className="gen-kicker mono">{chapter.title}</div>
          <h2>{current}</h2>
        </div>
        <div className="gen-board" aria-label="生成视频步骤画面">
          <div className="gen-node gen-node-main">
            <span className="mono">STEP</span>
            <strong>{String(step + 1).padStart(2, "0")}</strong>
          </div>
          <svg className="gen-lines" viewBox="0 0 760 500" aria-hidden="true">
            <path d="M 380 250 L 160 120" />
            <path d="M 380 250 L 610 130" />
            <path d="M 380 250 L 180 390" />
            <path d="M 380 250 L 610 390" />
          </svg>
          {tokens.map((token, i) => (
            <div className={`gen-token gen-token-${i}`} key={`${token}-${i}`}>
              <span className="mono">{String(i + 1).padStart(2, "0")}</span>
              <strong>{token}</strong>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function summarize(text: string) {
  const clean = text.replace(/[，。！？、,.!?]/g, " ");
  const parts = clean.split(/\s+/).filter(Boolean);
  const cjk = text.match(/[\u4e00-\u9fa5A-Za-z0-9]+/g) || parts;
  const chosen = cjk
    .map((part) => (part.length > 6 ? part.slice(0, 6) : part))
    .filter((part) => part.length >= 2)
    .slice(0, 4);
  while (chosen.length < 4) chosen.push(["目标", "工具", "执行", "检查"][chosen.length]);
  return chosen;
}
