// What a Flow's chat has already allowed, for a run of that Flow (t976): a repair inside the run
// never asks the person (`runtime/adaptation/recovery/runtime-exploration.ts`), so it holds the
// classes the person allowed in the chat, beside whatever the run's caller allowed. A class the
// person refused is not among them. Only the gated classes are ever held here. A chat record that
// cannot be read throws, as the store does: a run never goes ahead on an answer nobody could read.

import type { AutomationStudioActionConsequence } from "../../../../../runtime/action-permission-requests/index.ts";
import type { AutomationStudioFlowPaths, AutomationStudioProjectPaths } from "../../paths/index.ts";
import type { AutomationStudioProjectStore } from "../../projects/index.ts";
import { automationStudioAnswerFirstChatPermissionOf } from "./store-of.ts";

export async function automationStudioAnswerFirstChatHeldGrants(input: {
  owner: object;
  stores: { paths: Pick<AutomationStudioProjectPaths, "root">; flows: Pick<AutomationStudioFlowPaths, "flowDirectory">; projects: Pick<AutomationStudioProjectStore, "ensureProjectStructure"> };
  projectId: string | null | undefined;
  flowId: string | null | undefined;
}): Promise<AutomationStudioActionConsequence[]> {
  if (!input.projectId || !input.flowId) return [];
  return (await automationStudioAnswerFirstChatPermissionOf(input.owner, input.stores).get(input.projectId, input.flowId))?.granted ?? [];
}
