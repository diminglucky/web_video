import type { CSSProperties } from "react";
import type { ChapterStepProps } from "../../registry/types";
import "./CoreParts.css";

const actions = ["理解目标", "拆动作", "调用工具", "检查结果"];
const modules = [
  ["目标", "要完成什么"],
  ["工具", "能动用什么"],
  ["记忆", "做到哪里了"],
  ["规划", "下一步是什么"],
];
const tools = ["搜索", "写文件", "跑代码", "查数据库"];

export default function CorePartsChapter({ step }: ChapterStepProps) {
  if (step === 0) {
    return (
      <section className="cp-scene scene-pad cp-step-chain">
        <div className="cp-kicker mono">Core idea</div>
        <h2>目标，不是回答的终点。</h2>

        <div className="cp-chain" aria-label="目标拆成动作链">
          <div className="cp-goal-card">
            <span className="mono">TARGET</span>
            <strong>做成一件事</strong>
          </div>
          <svg className="cp-chain-line" viewBox="0 0 1180 180" aria-hidden="true">
            <path d="M 88 90 H 1092" />
          </svg>
          {actions.map((label, index) => (
            <div
              className="cp-action-node"
              style={{ "--i": String(index) } as CSSProperties}
              key={label}
            >
              <span className="mono">{String(index + 1).padStart(2, "0")}</span>
              <strong>{label}</strong>
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (step === 1) {
    return (
      <section className="cp-scene scene-pad cp-step-modules">
        <div className="cp-system-core">
          <span className="mono">AGENT</span>
          <strong>4 PARTS</strong>
        </div>
        <svg className="cp-module-lines" viewBox="0 0 1320 620" aria-hidden="true">
          <path d="M 660 310 L 255 155" />
          <path d="M 660 310 L 1065 155" />
          <path d="M 660 310 L 255 465" />
          <path d="M 660 310 L 1065 465" />
        </svg>
        {modules.map(([title, desc], index) => (
          <div
            className={`cp-module-card cp-module-${index}`}
            style={{ "--i": String(index) } as CSSProperties}
            key={title}
          >
            <span className="mono">{title}</span>
            <strong>{desc}</strong>
          </div>
        ))}
      </section>
    );
  }

  if (step === 2) {
    return (
      <section className="cp-scene scene-pad cp-step-tools">
        <div className="cp-tools-copy">
          <div className="cp-kicker mono">Tool surface</div>
          <h2>工具让模型真的能动手。</h2>
        </div>

        <div className="cp-tool-grid" aria-label="工具能力列表">
          {tools.map((tool, index) => (
            <div
              className="cp-tool-card"
              style={{ "--i": String(index) } as CSSProperties}
              key={tool}
            >
              <span className="mono">TOOL / {String(index + 1).padStart(2, "0")}</span>
              <strong>{tool}</strong>
            </div>
          ))}
        </div>

        <div className="cp-planning-strip">
          <span className="mono">MEMORY</span>
          <strong>记录进度</strong>
          <span className="cp-strip-arrow mono">-&gt;</span>
          <span className="mono">PLAN</span>
          <strong>决定下一步</strong>
        </div>
      </section>
    );
  }

  return null;
}
