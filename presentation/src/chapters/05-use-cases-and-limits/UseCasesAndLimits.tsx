import type { CSSProperties } from "react";
import type { ChapterStepProps } from "../../registry/types";
import "./UseCasesAndLimits.css";

const useCases = ["代码", "资料", "报告", "表格", "日程"];
const conditions = ["查", "判断", "操作", "复核"];
const risks = ["判断错", "拆歪", "调错", "跑偏"];
const boundaries = ["工具权限", "确认动作", "过程记录", "结果验收"];

export default function UseCasesAndLimitsChapter({ step }: ChapterStepProps) {
  if (step === 0) {
    return (
      <section className="ul-scene scene-pad ul-step-use">
        <div className="ul-copy">
          <div className="ul-kicker mono">Useful when work has steps</div>
          <h2>多步任务，才是主场。</h2>
        </div>
        <div className="ul-use-grid" aria-label="常见 Agent 工作流场景">
          {useCases.map((item, index) => (
            <div
              className="ul-use-card"
              style={{ "--i": String(index) } as CSSProperties}
              key={item}
            >
              <span className="mono">{String(index + 1).padStart(2, "0")}</span>
              <strong>{item}</strong>
            </div>
          ))}
        </div>
        <div className="ul-condition-row">
          {conditions.map((item) => (
            <span className="mono" key={item}>{item}</span>
          ))}
        </div>
      </section>
    );
  }

  if (step === 1) {
    return (
      <section className="ul-scene scene-pad ul-step-risk">
        <div className="ul-risk-title">
          <div className="ul-kicker mono">Failure modes</div>
          <h2>它也会一路跑偏。</h2>
        </div>
        <div className="ul-risk-chain" aria-label="Agent 风险链">
          {risks.map((risk, index) => (
            <div
              className="ul-risk-card"
              style={{ "--i": String(index) } as CSSProperties}
              key={risk}
            >
              <span className="mono">RISK / {String(index + 1).padStart(2, "0")}</span>
              <strong>{risk}</strong>
            </div>
          ))}
          <svg className="ul-risk-line" viewBox="0 0 1220 260" aria-hidden="true">
            <path d="M 120 130 H 1100" />
          </svg>
        </div>
      </section>
    );
  }

  if (step === 2) {
    return (
      <section className="ul-scene scene-pad ul-step-boundary">
        <div className="ul-boundary-panel">
          <span className="mono">BOUNDARY</span>
          <strong>不要完全自由发挥</strong>
        </div>
        <div className="ul-boundary-grid" aria-label="Agent 边界清单">
          {boundaries.map((item, index) => (
            <div
              className="ul-boundary-card"
              style={{ "--i": String(index) } as CSSProperties}
              key={item}
            >
              <span className="mono">{String(index + 1).padStart(2, "0")}</span>
              <strong>{item}</strong>
            </div>
          ))}
        </div>
      </section>
    );
  }

  return null;
}
