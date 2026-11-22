// A runtime repair belongs to the Flow's existing chat. It holds grants and refusals alike and
// records new consequences for the next task start; it cannot put another question mid-Flow.

import type { AutomationStudioRuntimeRecoveryPorts } from "../../../../../runtime/adaptation/recovery/index.ts";
import type { AutomationStudioFlowPaths, AutomationStudioProjectPaths } from "../../paths/index.ts";
import type { AutomationStudioProjectStore } from "../../projects/index.ts";
import { automationStudioAnswerFirstChatPermissionOf } from "./store-of.ts";

export function automationStudioAnswerFirstChatRecoveryGround(input: {
  owner: object;
  stores: { paths: Pick<AutomationStudioProjectPaths, "root">; flows: Pick<AutomationStudioFlowPaths, "flowDirectory">; projects: Pick<AutomationStudioProjectStore, "ensureProjectStructure"> };
}): NonNullable<AutomationStudioRuntimeRecoveryPorts["permissionForRecovery"]> {
  const chat = automationStudioAnswerFirstChatPermissionOf(input.owner, input.stores);
  return async (projectId, flowId) => {
    const held = await chat.get(projectId, flowId);
    return {
      ...(held ? { held: { granted: held.granted, declined: held.declined, requestId: held.declinedRequestId } } : {}),
      unforeseen: (classes) => chat.unforeseen(projectId, flowId, classes)
    };
  };
}
