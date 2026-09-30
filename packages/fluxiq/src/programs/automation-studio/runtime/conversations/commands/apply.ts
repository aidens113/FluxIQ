// Putting a suggested change into its Flow.
//
// A built change is `proposed`; approving makes it `validated`, and only
// applying puts it into the Flow. A person who asked for a Flow to be made, or
// who said yes to a change, means the Flow should have it, so this takes the
// change through both -- exactly the panel's `adaptation.apply`.

import type { AutomationStudioConversationCommandContext } from "./command.ts";
import { automationStudioConversationCallCause } from "./progress.ts";

export type AutomationStudioConversationApplyResult =
  | { ok: true }
  | { ok: false; cause: string; approved: boolean };

export async function applyAutomationStudioConversationAdaptation(
  context: AutomationStudioConversationCommandContext,
  input: { flowId: string; adaptationId: string }
): Promise<AutomationStudioConversationApplyResult> {
  const review = (action: "approve" | "apply") => context.port.call("review-flow-adaptation", {
    projectId: context.projectId,
    flowId: input.flowId,
    adaptationId: input.adaptationId,
    action
  });
  const approved = await review("approve");
  if (!approved.ok) return { ok: false, cause: automationStudioConversationCallCause("accepting the change", approved), approved: false };
  const applied = await review("apply");
  if (!applied.ok) return { ok: false, cause: automationStudioConversationCallCause("applying the change", applied), approved: true };
  return { ok: true };
}
