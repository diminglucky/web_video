import type { CSSProperties } from "react";
import type { ChapterStepProps } from "../../registry/types";
import "./NotMagic.css";

const stack = ["MODEL", "SOFTWARE", "STATE", "TOOLS"];

export default function NotMagicChapter({ step }: ChapterStepProps) {
  if (step === 0) {
    return (
      <section className="nm-scene scene-pad nm-step-compare">
        <div className="nm-compare-card nm-chat">
          <span className="mono">CHATBOT</span>
          <strong>回答</strong>
          <p>生成一段文字，然后停下。</p>
        </div>
        <div className="nm-vs mono">VS</div>
        <div className="nm-compare-card nm-agent">
          <span className="mono">AGENT</span>
          <strong>执行</strong>
          <p>围绕目标继续推进。</p>
        </div>
      </section>
    );
  }

  if (step === 1) {
    return (
      <section className="nm-scene scene-pad nm-step-stack">
        <div className="nm-stack-copy">
          <div className="nm-kicker mono">No magic layer</div>
          <h2>不是人格，是系统。</h2>
        </div>
        <div className="nm-stack" aria-label="Agent 系统栈">
          {stack.map((item, index) => (
            <div
              className="nm-stack-layer"
              style={{ "--i": String(index) } as CSSProperties}
              key={item}
            >
              <span className="mono">{item}</span>
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (step === 2) {
    return (
      <section className="nm-scene scene-pad nm-step-wired">
        <div className="nm-wired-board">
          <div className="nm-wired-node nm-model">
            <span className="mono">MODEL</span>
            <strong>理解与生成</strong>
          </div>
          <div className="nm-wired-node nm-goal">
            <span className="mono">GOAL</span>
            <strong>任务方向</strong>
          </div>
          <div className="nm-wired-node nm-tools">
            <span className="mono">TOOLS</span>
            <strong>外部动作</strong>
          </div>
          <svg className="nm-wires" viewBox="0 0 1120 560" aria-hidden="true">
            <path d="M 235 280 H 560" />
            <path d="M 560 280 H 885" />
            <path d="M 560 280 C 560 120, 235 120, 235 280" />
            <path d="M 560 280 C 560 440, 885 440, 885 280" />
          </svg>
          <div className="nm-wired-caption mono">MODEL + TOOLS + GOAL</div>
        </div>
      </section>
    );
  }

  return null;
}
