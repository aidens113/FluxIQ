import { normalizeAutomationWorkspacePrefs } from "../layout/persistence";
import type { AutomationWorkspaceRenderStore } from "../render-store";
import type { AutomationWorkspaceCommandPort, AutomationWorkspaceCommitOptions } from "./contracts";

export function createAutomationWorkspaceCommandPort(
  store: AutomationWorkspaceRenderStore,
  options: {
    onCommit?(prefs: ReturnType<AutomationWorkspaceRenderStore["getPrefs"]>, commit: AutomationWorkspaceCommitOptions): void;
    schedule?(operation: () => void): void;
  } = {}
): AutomationWorkspaceCommandPort {
  return {
    read: store.getPrefs,
    commit(update, commitOptions = {}) {
      const current = store.getPrefs();
      const candidate = update(current);
      if (candidate === current) return false;
      const next = normalizeAutomationWorkspacePrefs(candidate);
      const changed = store.replace(next);
      if (changed) options.onCommit?.(store.getPrefs(), commitOptions);
      return changed;
    },
    ...(options.schedule ? { schedule: options.schedule } : {})
  };
}
