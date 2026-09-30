// Building a Flow by exploring the site: the step create-here, explore and
// improve share.
//
// The request is the one the panel's "Explore and build" and "Improve
// automation" send (`generate-flow-bootstrap-adaptation`, evidence-guided),
// plus what only the chat knows: the page the person has open, as the place
// the Flow starts. The session travels as `authSessionId` because the endpoint
// refuses a request whose session is not the caller's own.

import type { AutomationStudioConversationCommandContext } from "./command.ts";
import { automationStudioConversationCallCause } from "./progress.ts";

export type AutomationStudioConversationBuildResult =
  | {
      ok: true;
      adaptationId: string;
      /** True when the build finished holding a question: the change cannot be applied until it is answered. */
      awaitingPermission: boolean;
    }
  | { ok: false; cause: string };

export async function buildAutomationStudioFlowFromConversation(
  context: AutomationStudioConversationCommandContext,
  input: { flowId: string; mode: "create" | "extend" }
): Promise<AutomationStudioConversationBuildResult> {
  const response = await context.port.call("generate-flow-bootstrap-adaptation", {
    projectId: context.projectId,
    flowId: input.flowId,
    authSessionId: context.sessionId,
    evidenceGuided: true,
    // An extend amends the Flow's own steps from where the Flow already
    // starts; the page on screen is a creation's starting point.
    ...(input.mode === "extend" ? { mode: "extend" } : context.startLocation ? { startLocation: context.startLocation } : {})
  });
  if (!response.ok) return { ok: false, cause: automationStudioConversationCallCause("the build", response) };
  const adaptation = (response.payload as { adaptation?: { adaptationId?: unknown; permissionRequest?: unknown } } | undefined)?.adaptation;
  if (!adaptation || typeof adaptation.adaptationId !== "string" || !adaptation.adaptationId) {
    return { ok: false, cause: "the build answered without the change it made" };
  }
  return { ok: true, adaptationId: adaptation.adaptationId, awaitingPermission: Boolean(adaptation.permissionRequest) };
}
