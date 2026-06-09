import type { CSSProperties } from "react";
import type { ChapterStepProps } from "../../registry/types";
import "./Takeaway.css";

const loop = ["观察", "规划", "行动", "检查"];
const questions = ["目标是什么？", "能用哪些工具？", "怎么知道做对了？"];

export default function TakeawayChapter({ step }: ChapterStepProps) {
  if (step === 0) {
    return (
      <section className="tk-scene scene-pad tk-step-loop">
        <div className="tk-definition">
          <span className="mono">DEFINITION</span>
          <strong>带工具的 AI 工作流</strong>
        </div>
        <div className="tk-loop" aria-label="Agent 工作循环">
          {loop.map((item, index) => (
            <div
              className={`tk-loop-node tk-loop-${index}`}
              style={{ "--i": String(index) } as CSSProperties}
              key={item}
            >
              <span className="mono">{String(index + 1).padStart(2, "0")}</span>
              <strong>{item}</strong>
            </div>
          ))}
          <svg className="tk-loop-lines" viewBox="0 0 820 620" aria-hidden="true">
            <path d="M 410 95 C 735 95, 735 525, 410 525 C 85 525, 85 95, 410 95" />
            <path d="M 610 525 L 410 525 L 410 410" />
          </svg>
        </div>
      </section>
    );
  }

  if (step === 1) {
    return (
      <section className="tk-scene scene-pad tk-step-productivity">
        <div className="tk-big-line">
          <span className="mono">PRODUCTIVITY TEST</span>
          <h2>不是答得漂亮。</h2>
          <h2 className="tk-accent">是把任务推到结束。</h2>
        </div>
        <div className="tk-progress-rail" aria-hidden="true">
          <div className="tk-progress-fill" />
        </div>
      </section>
    );
  }

  if (step === 2) {
    return (
      <section className="tk-scene scene-pad tk-step-questions">
        <div className="tk-question-title">
          <span className="mono">CHECKLIST</span>
          <h2>三问判断靠不靠谱。</h2>
        </div>
        <div className="tk-question-grid" aria-label="判断 Agent 是否靠谱的三问">
          {questions.map((question, index) => (
            <div
              className="tk-question-card"
              style={{ "--i": String(index) } as CSSProperties}
              key={question}
            >
              <span className="mono">Q{index + 1}</span>
              <strong>{question}</strong>
            </div>
          ))}
        </div>
      </section>
    );
  }

  return null;
}
