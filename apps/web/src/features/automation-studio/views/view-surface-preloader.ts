import { scheduleAutomationStudioAfterPaintIdleWork } from "../sync/background-work";
import { automationStudioViewBaseId } from "./view-registry";

const viewSurfaceLoaders: Readonly<Record<string, () => Promise<unknown>>> = {
  "flow-nodes": () => import("../flow-editor/FlowGraphCanvas")
};

export function scheduleAutomationViewSurfacePreload(viewIds: readonly string[]): () => void {
  const loaders = Array.from(new Set(viewIds))
    .map((viewId) => viewSurfaceLoaders[automationStudioViewBaseId(viewId)])
    .filter((loader): loader is () => Promise<unknown> => Boolean(loader));
  if (!loaders.length) return () => undefined;
  return scheduleAutomationStudioAfterPaintIdleWork(() => {
    for (const load of loaders) void load();
  }, 1_000);
}
