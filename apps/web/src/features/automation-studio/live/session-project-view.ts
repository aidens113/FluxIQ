import type { AutomationStudioStores } from "../stores";
import type { AutomationWorkspaceRenderStore } from "../workspace/render-store";
import { createAutomationProjectViewModelCache } from "../model/project-view-model-cache";

export {
  EMPTY_AUTOMATION_GATEWAY_SNAPSHOT,
  EMPTY_AUTOMATION_LIST,
  EMPTY_AUTOMATION_PROJECT_ARTIFACTS,
  EMPTY_AUTOMATION_RECORD
} from "../model/project-view-model-cache";

export function createAutomationSessionProjectViewReader(args: {
  activeProjectId: string | null;
  stores: AutomationStudioStores;
  workspace: AutomationWorkspaceRenderStore;
}) {
  const cache = createAutomationProjectViewModelCache(args);
  return cache.read;
}
