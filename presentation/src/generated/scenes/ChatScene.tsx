import { getSceneState } from "../sceneTypes";
import type { ScenePlan } from "../sceneTypes";
import "./ChatScene.css";

interface Props {
  plan: ScenePlan;
  timeMs?: number;
}

export function ChatScene({ plan, timeMs }: Props) {
  const sceneState = getSceneState(plan, timeMs);
  const actorById = new Map(plan.actors.map((actor) => [actor.id, actor]));
  const visibleMessages = plan.messages.filter((message) =>
    sceneState.visibleMessageIds.includes(message.id),
  );

  return (
    <div
      className="scene-chat"
      data-scene-type="chat"
      data-scene-state={sceneState.state}
      data-scene-progress={sceneState.progress.toFixed(3)}
      aria-label={plan.intent}
    >
      <div className="scene-chat-header">
        <div>
          <span className="scene-chat-eyebrow">对话现场</span>
          <strong>{plan.claim}</strong>
        </div>
        <span className="scene-chat-status">{sceneState.state}</span>
      </div>

      <div className="scene-chat-thread" aria-live="polite">
        {visibleMessages.length === 0 && (
          <div className="scene-chat-empty">问题正在进入对话</div>
        )}
        {visibleMessages.map((message) => {
          const actor = actorById.get(message.actorId);
          const isUser = actor?.role === "user";
          return (
            <article
              className={`scene-chat-message ${isUser ? "is-user" : "is-response"}`}
              data-object-id={message.id}
              key={message.id}
            >
              <div className="scene-chat-avatar" aria-hidden="true">
                {(actor?.label || "?").slice(0, 1)}
              </div>
              <div className="scene-chat-message-body">
                <span className="scene-chat-actor">{actor?.label || "参与者"}</span>
                <p>{message.text}</p>
              </div>
            </article>
          );
        })}
        {sceneState.activeActionIds.length > 0 && (
          <div className="scene-chat-thinking" data-no-advance>
            <i /><i /><i />
            <span>正在回应当前信息</span>
          </div>
        )}
      </div>

      <div className="scene-chat-footer">
        <span>{visibleMessages.length} 条信息已呈现</span>
        <span className="scene-chat-progress" aria-hidden="true">
          <i style={{ width: `${Math.max(4, sceneState.progress * 100)}%` }} />
        </span>
      </div>
    </div>
  );
}
