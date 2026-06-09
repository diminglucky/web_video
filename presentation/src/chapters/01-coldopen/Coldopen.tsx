import type { ChapterStepProps } from "../../registry/types";
import "./Coldopen.css";

const taskNodes = ["天气", "路线", "预算", "酒店", "计划"];

export default function ColdopenChapter({ step }: ChapterStepProps) {
  if (step === 0) {
    return (
      <section className="co-scene scene-pad co-step-chat">
        <div className="co-blueprint-id mono">AGENT PRIMER / 01</div>

        <div className="co-chat-layout">
          <div className="co-chat-copy">
            <div className="co-kicker mono">Most AI today</div>
            <h1>很多 AI，还只是会聊天。</h1>
            <p>一问一答。像一台很会补全文字的机器。</p>
          </div>

          <div className="co-chat-board" aria-label="单轮问答示意">
            <div className="co-axis co-axis-x" />
            <div className="co-axis co-axis-y" />
            <div className="co-chat-card co-card-user">
              <span className="co-card-label mono">INPUT</span>
              <strong>帮我解释一下 Agent</strong>
            </div>
            <div className="co-chat-card co-card-answer">
              <span className="co-card-label mono">ANSWER</span>
              <strong>Agent 是一种...</strong>
            </div>
            <svg className="co-chat-line" viewBox="0 0 700 260" aria-hidden="true">
              <path d="M 115 86 C 250 84, 294 170, 428 168" />
              <circle cx="115" cy="86" r="8" />
              <circle cx="428" cy="168" r="8" />
            </svg>
            <div className="co-one-shot mono">1 INPUT / 1 REPLY</div>
          </div>
        </div>
      </section>
    );
  }

  if (step === 1) {
    return (
      <section className="co-scene scene-pad co-step-agent">
        <div className="co-agent-system" aria-label="Agent 推进任务示意">
          <div className="co-target-ring">
            <span className="mono">TARGET</span>
            <strong>AGENT</strong>
          </div>

          <svg className="co-agent-orbits" viewBox="0 0 900 900" aria-hidden="true">
            <circle className="co-orbit co-orbit-a" cx="450" cy="450" r="245" />
            <circle className="co-orbit co-orbit-b" cx="450" cy="450" r="335" />
            <path className="co-agent-path" d="M 450 205 L 655 450 L 450 695 L 245 450 Z" />
          </svg>

          <div className="co-satellite co-sat-plan mono">PLAN</div>
          <div className="co-satellite co-sat-tool mono">TOOLS</div>
          <div className="co-satellite co-sat-memory mono">MEMORY</div>
          <div className="co-satellite co-sat-check mono">CHECK</div>
        </div>

        <div className="co-agent-copy">
          <div className="co-kicker mono">Not only answer</div>
          <h2>它会自己推进任务。</h2>
          <p>像一个接到目标后，会继续往下做的数字同事。</p>
        </div>
      </section>
    );
  }

  if (step === 2) {
    return (
    <section className="co-scene scene-pad co-step-travel">
      <div className="co-travel-copy">
        <div className="co-kicker mono">Same request, different shape</div>
        <h2>一句话，拆成一条任务链。</h2>
      </div>

      <div className="co-request-row">
        <div className="co-request-card">
          <span className="co-card-label mono">REQUEST</span>
          <strong>帮我规划周末旅行</strong>
        </div>
        <div className="co-suggestion-card">
          <span className="co-card-label mono">CHATBOT</span>
          <strong>给你一段建议</strong>
        </div>
      </div>

      <div className="co-task-chain" aria-label="旅行规划任务链">
        <svg className="co-task-lines" viewBox="0 0 1360 270" aria-hidden="true">
          <path d="M 105 138 H 1255" />
          <path className="co-branch-line" d="M 105 138 C 305 32, 1042 32, 1255 138" />
        </svg>
        {taskNodes.map((label, index) => (
          <div
            className="co-task-node"
            style={{ "--i": String(index) } as React.CSSProperties}
            key={label}
          >
            <span className="co-node-index mono">{String(index + 1).padStart(2, "0")}</span>
            <strong>{label}</strong>
          </div>
        ))}
      </div>

      <div className="co-plan-output">
        <span className="co-card-label mono">OUTPUT</span>
        <strong>一份可以执行的旅行计划</strong>
      </div>
    </section>
    );
  }

  return null;
}
