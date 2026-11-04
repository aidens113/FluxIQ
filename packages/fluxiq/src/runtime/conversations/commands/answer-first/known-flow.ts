// The Flow a task already lives under, for "automate this" to reuse (t869, second attempt D10): the
// same words on the same site have one, and a repeat of them makes no blank Flow of its own. Core
// answers it by a read route, since a command reaches Core only through its port.
//
// **It never fails the task.** A call that fails, or answers no Flow, is a task with no Flow yet, and
// the command makes one as it always did. Only answer-first mode asks; the other modes make a Flow
// each time, as they always have.

import type { AutomationStudioConversationCommandContext } from "../command.ts";
import { automationStudioConversationAnswersFirst } from "./answers-first.ts";

export async function automationStudioConversationKnownFlow(context: Pick<AutomationStudioConversationCommandContext, "port" | "projectId" | "startLocation">, instructionText: string): Promise<string | undefined> {
  if (!automationStudioConversationAnswersFirst()) return undefined;
  const asked = { projectId: context.projectId, instructionText, ...(context.startLocation ? { startLocation: context.startLocation } : {}) };
  // A call that throws is a failed call: named as one, so it is never read as a task with no Flow by accident.
  const known = await context.port.call("get-task-known-flow", asked).then((answer) => answer, (error: unknown) => ({ ok: false as const, error: error instanceof Error ? error.message : "FluxIQ could not look for the task's Flow" }));
  const flowId = known.ok ? (known.payload as { flowId?: unknown } | undefined)?.flowId : undefined;
  return typeof flowId === "string" && flowId ? flowId : undefined;
}
