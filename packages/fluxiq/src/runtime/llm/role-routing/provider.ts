import type { AutomationStudioLlmProvider, AutomationStudioLlmTaskRequest } from "../harness/index.ts";
import type { AutomationStudioLlmModelRole } from "./kind-roles.ts";
import { automationStudioLlmAttemptKey } from "./ladder/index.ts";

/** Historical configuration shape, accepted for compatibility. It no longer changes serving. */
export type AutomationStudioLlmProviderLadder = {
  tiers: readonly { model: string; provider: AutomationStudioLlmProvider }[];
  from: Readonly<Record<AutomationStudioLlmModelRole, number | undefined>>;
};

/** Every automation role uses its starting provider, including legacy per-role/ladder configurations. */
export function automationStudioLlmProviderRoutedByRole(providers: { explore: AutomationStudioLlmProvider; judge?: AutomationStudioLlmProvider | undefined; repair?: AutomationStudioLlmProvider | undefined; ladder?: AutomationStudioLlmProviderLadder | undefined }): AutomationStudioLlmProvider {
  const { explore } = providers;
  if (!providers.ladder && (!providers.judge || providers.judge === explore) && (!providers.repair || providers.repair === explore)) return explore;
  const servedBy = (request: AutomationStudioLlmTaskRequest) => explore.servedBy?.(request) ?? explore;
  return {
    ...explore,
    servedBy,
    runTask: async (request, execution) => await servedBy(request).runTask(automationStudioLlmRequestOfAttempt(request), execution)
  };
}

/** Request identity still follows the attempt frame, independent of historical escalation data. */
function automationStudioLlmRequestOfAttempt(request: AutomationStudioLlmTaskRequest): AutomationStudioLlmTaskRequest {
  const key = automationStudioLlmAttemptKey();
  return key === undefined ? request : { ...request, metadata: { ...request.metadata, attemptKey: key } };
}
