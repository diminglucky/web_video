import type { CSSProperties } from "react";
import type { ChapterStepProps } from "../../registry/types";
import "./WorkChain.css";

const firstFlow = ["理解目标", "拆小任务", "查资料"];
const secondFlow = ["调用工具", "检查结果", "换路继续"];
const debugSteps = ["LOG", "ERROR", "CONFIG", "PATCH", "TEST"];

export default function WorkChainChapter({ step }: ChapterStepProps) {
  if (step === 0) {
    return (
      <section className="wc-scene scene-pad wc-step-flow">
        <div className="wc-copy">
          <div className="wc-kicker mono">Work chain / start</div>
          <h2>它先把目标变成路径。</h2>
        </div>
        <div className="wc-flow-board" aria-label="Agent 工作链前半段">
          {firstFlow.map((label, index) => (
            <div
              className="wc-flow-node"
              style={{ "--i": String(index) } as CSSProperties}
              key={label}
            >
              <span className="mono">{String(index + 1).padStart(2, "0")}</span>
              <strong>{label}</strong>
            </div>
          ))}
          <svg className="wc-flow-lines" viewBox="0 0 1040 260" aria-hidden="true">
            <path d="M 170 130 H 870" />
          </svg>
        </div>
      </section>
    );
  }

  if (step === 1) {
    return (
      <section className="wc-scene scene-pad wc-step-loop">
        <div className="wc-loop-core">
          <span className="mono">IF WRONG</span>
          <strong>换路继续</strong>
        </div>
        <div className="wc-loop-nodes" aria-label="调用工具并复核">
          {secondFlow.map((label, index) => (
            <div
              className={`wc-loop-node wc-loop-${index}`}
              style={{ "--i": String(index) } as CSSProperties}
              key={label}
            >
              <span className="mono">{String(index + 4).padStart(2, "0")}</span>
              <strong>{label}</strong>
            </div>
          ))}
          <svg className="wc-loop-lines" viewBox="0 0 980 620" aria-hidden="true">
            <path d="M 180 160 H 800 V 460 H 180 Z" />
            <path d="M 490 460 V 305" />
          </svg>
        </div>
      </section>
    );
  }

  if (step === 2) {
    return (
      <section className="wc-scene scene-pad wc-step-debug">
        <div className="wc-debug-header">
          <div className="wc-kicker mono">Case trace</div>
          <h2>项目启动失败，不只猜原因。</h2>
        </div>
        <div className="wc-debug-grid" aria-label="项目启动失败排查链">
          {debugSteps.map((label, index) => (
            <div
              className="wc-debug-card"
              style={{ "--i": String(index) } as CSSProperties}
              key={label}
            >
              <span className="mono">{label}</span>
              <strong>{debugLabel(label)}</strong>
            </div>
          ))}
        </div>
        <div className="wc-result-card">
          <span className="mono">RESULT</span>
          <strong>可复核的执行记录</strong>
        </div>
      </section>
    );
  }

  return null;
}

function debugLabel(label: string) {
  switch (label) {
    case "LOG":
      return "打开日志";
    case "ERROR":
      return "搜索报错";
    case "CONFIG":
      return "检查配置";
    case "PATCH":
      return "改代码";
    default:
      return "跑测试";
  }
}
