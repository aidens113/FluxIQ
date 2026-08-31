import { createAutomationRequestCoordinator, type AutomationRequestCoordinator } from '../project/request-coordinator';
import type { AutomationProjectGenerationOwner } from '../project/project-lifecycle';
import { createAutomationStudioStores, type AutomationStudioStores } from '../stores/studio-stores';
import { defaultAutomationWorkspacePrefs } from '../workspace/layout';
import { createAutomationWorkspaceRenderStore, type AutomationWorkspaceRenderStore } from '../workspace/render-store';
import { createAutomationStudioUiStore, type AutomationStudioUiStore } from '../workspace/studio-ui-store';

export type AutomationProjectGeneration = AutomationProjectGenerationOwner;

export type AutomationStudioRuntime = {
  owners: {
    studioStores: AutomationStudioStores;
    studioUiStore: AutomationStudioUiStore;
    workspaceRenderStore: AutomationWorkspaceRenderStore;
  };
  projectGeneration: AutomationProjectGeneration;
  requests: AutomationRequestCoordinator;
  dispose(): void;
};

export function createAutomationStudioRuntime(): AutomationStudioRuntime {
  const requests = createAutomationRequestCoordinator();
  let generation = 0;
  return {
    owners: {
      studioStores: createAutomationStudioStores(),
      studioUiStore: createAutomationStudioUiStore(),
      workspaceRenderStore: createAutomationWorkspaceRenderStore(defaultAutomationWorkspacePrefs())
    },
    projectGeneration: {
      advance: () => ++generation,
      current: () => generation,
      isCurrent: (candidate) => candidate === generation
    },
    requests,
    dispose() {
      requests.cancelAll();
      generation += 1;
    }
  };
}
