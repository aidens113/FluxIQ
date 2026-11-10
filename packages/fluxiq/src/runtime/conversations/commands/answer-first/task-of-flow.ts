// Whether a Flow the chat was asked to Run is a task's Flow, and where that task starts (t885). Core
// answers it by the known-Flow read route asked by a Flow, since a command reaches Core only through
// its port. Only answer-first mode asks; in every other mode a Run runs the Flow, as it always has.
//
// **It never fails the Run.** A call that fails, or answers no Flow, is a Flow no task lives under,
// and the Run goes on as any other Flow's.

import type { AutomationStudioConversationCommandContext } from "../command.ts";
import { automationStudioConversationAnswersFirst } from "./answers-first.ts";

/** The task a Flow holds: where it starts, or null where it kept no start place. Undefined where no task lives under the Flow. */
export type AutomationStudioConversationTaskOfFlow = { startLocation: string | null };

export async function automationStudioConversationTaskOfFlow(context: Pick<AutomationStudioConversationCommandContext, "port" | "projectId">, flowId: string): Promise<AutomationStudioConversationTaskOfFlow | undefined> {
  if (!automationStudioConversationAnswersFirst()) return undefined;
  const known = await context.port.call("get-task-known-flow", { projectId: context.projectId, flowId }).then((answer) => answer, () => ({ ok: false as const }));
  const payload = known.ok ? (known.payload as { flowId?: unknown; startLocation?: unknown } | undefined) : undefined;
  if (payload?.flowId !== flowId) return undefined;
  return { startLocation: typeof payload.startLocation === "string" && payload.startLocation ? payload.startLocation : null };
}
