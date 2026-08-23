import type { ReactNode } from "react";
import type { ScenePlan } from "./sceneTypes";
import { ChatScene } from "./scenes/ChatScene";

interface Props {
  plan: ScenePlan;
  timeMs?: number;
  fallback: ReactNode;
}

export function SceneRenderer({ plan, timeMs, fallback }: Props) {
  switch (plan.type) {
    case "chat":
      return <ChatScene plan={plan} timeMs={timeMs} />;
    default:
      return fallback;
  }
}
