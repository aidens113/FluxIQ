// The one permission question a task asks when it starts (t976, F21; the user's rule, 2026-11-03
// and 2026-11-10: dangerous acts ask "ONLY WHEN FIRST STARTING A FLOW/CHAT", never mid-Flow, and
// the lead's MVP decision: one plain question, never again in the same chat).
//
// Before the saved Flow runs and before any round, the attempt hands its gate what the chat holds
// and the classes the task needs (`./start-request.ts`), and the gate asks once about whatever is
// gated and still unanswered (`runtime/flow-authoring/bootstrap/start-asking.ts`). The classes are
// those the chat's own reading declared (`runtime/conversations/instructions/acts.ts`), so no model
// call is added; a later attempt at the same words, or a Run again, takes those the chat kept. A
// saved Flow's own check before it runs is still that start, for a class its steps declare. A
// class a run met that nobody foresaw was added to the same record (`./ground.ts`), so it is asked
// about here, at the next start.
//
// A carried-on attempt is the same attempt going on, already under way: it holds the chat's answer
// and asks nothing.

import type { AutomationStudioFlowBootstrapActionPermissions, AutomationStudioFlowBootstrapStartPermission } from "../../../../../runtime/flow-authoring/bootstrap/index.ts";
import type { AutomationStudioFlowPaths, AutomationStudioProjectPaths } from "../../paths/index.ts";
import type { AutomationStudioProjectStore } from "../../projects/index.ts";
import { automationStudioAnswerFirstChatInstruction } from "./instruction-key.ts";
import { automationStudioAnswerFirstChatStartRequest } from "./start-request.ts";
import { automationStudioAnswerFirstChatPermissionOf } from "./store-of.ts";

export async function automationStudioAnswerFirstPermissionAtStart(input: {
  owner: object;
  stores: { paths: Pick<AutomationStudioProjectPaths, "root">; flows: Pick<AutomationStudioFlowPaths, "flowDirectory">; projects: Pick<AutomationStudioProjectStore, "ensureProjectStructure"> };
  projectId: string;
  flowId: string;
  instructionText: string;
  /** What the chat's reading declared the task will cause; absent when nothing was declared (a Run again, a known task, a caller). */
  taskActs?: readonly string[] | undefined;
  permissions: Pick<AutomationStudioFlowBootstrapActionPermissions, "askAtStart">;
  /** A carried-on attempt, already under way: nothing is asked. */
  carriedOn: boolean;
}): Promise<AutomationStudioFlowBootstrapStartPermission> {
  const chat = automationStudioAnswerFirstChatPermissionOf(input.owner, input.stores);
  const instruction = automationStudioAnswerFirstChatInstruction(input.instructionText);
  const request = await automationStudioAnswerFirstChatStartRequest({ chat, projectId: input.projectId, flowId: input.flowId, instruction, taskActs: input.taskActs });
  const start = await input.permissions.askAtStart({ ...request, ask: !input.carriedOn });
  // The classes, kept for the next attempt at the same words: a Run again declares none.
  if (request.classes?.length) {
    try {
      await chat.needs(input.projectId, input.flowId, instruction, request.classes);
    } catch {
      /* best-effort: the next attempt takes the classes from the chat's reading again. */
    }
  }
  return start;
}
