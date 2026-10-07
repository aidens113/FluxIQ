import { parseAutomationStudioCandidateAuthoringResult, type AutomationStudioCandidateAuthoringResult } from "../../flow-bootstrap/authoring-result/index.ts";
// Building a Flow by exploring the site: the step create-here, explore and
// improve share.
//
// The request is the one the panel's "Explore and build" and "Improve
// automation" send (`generate-flow-bootstrap-adaptation`, evidence-guided),
// plus what only the chat knows: the page the person has open, as the place
// the Flow starts, and what reading the person's message cost, which the build
// carries in the Flow's creation purse (the rule is a ceiling per Flow, and the
// chat call that decided to build it is part of that Flow's cost). The session
// travels as `authSessionId` because the endpoint refuses a request whose
// session is not the caller's own.

import type { AutomationStudioConversationCommandCallResult, AutomationStudioConversationCommandContext } from "./command.ts";
import { automationStudioConversationCallCause } from "./progress.ts";

export type AutomationStudioConversationBuildResult =
  | { ok: true; status: "draft"; candidate: AutomationStudioCandidateAuthoringResult }
  /**
   * `ending` is the build's own account for the person, when it gave one; the
   * answer opens with it (`./progress.ts`). `kept` is true when the build kept
   * the steps it had found as an incomplete draft that building again carries
   * on from, though the Flow itself holds none of them
   * (`diagnostic.evidenceLoop.incompleteDraft`,
   * `../../flow-bootstrap/generation-failure/diagnostic.ts`).
   */
  | { ok: false; cause: string; ending?: string; kept: boolean };

export async function buildAutomationStudioFlowFromConversation(
  context: AutomationStudioConversationCommandContext,
  input: { flowId: string; mode: "create" | "extend" }
): Promise<AutomationStudioConversationBuildResult> {
  const response = await context.port.call("generate-flow-bootstrap-adaptation", {
    projectId: context.projectId,
    flowId: input.flowId,
    authSessionId: context.sessionId,
    evidenceGuided: true,
    authoringMode: "candidate",
    // An extend amends the Flow's own steps from where the Flow already
    // starts; the page on screen is a creation's starting point.
    ...(input.mode === "extend" ? { mode: "extend" } : context.startLocation ? { startLocation: context.startLocation } : {}),
    ...(context.interpretationCostUsd === undefined ? {} : { interpretationCostUsd: context.interpretationCostUsd })
  });
  if (!response.ok) {
    const ending = (response.payload as { cancelled?: boolean } | undefined)?.cancelled === true ? "Build stopped. The Flow was not promoted." : buildEnding(response);
    return { ok: false, cause: automationStudioConversationCallCause("the build", response), ...(ending ? { ending } : {}), kept: keptDraft(response) };
  }
  const candidate = parseAutomationStudioCandidateAuthoringResult(response.payload, { projectId: context.projectId, flowId: input.flowId });
  if (!candidate) return { ok: false, cause: "the build answered without a valid candidate draft for this Flow", kept: false };
  return { ok: true, status: "draft", candidate };
}

/**
 * The build's own account of why it could not finish, written for the person --
 * not doable and why, or the budget that ran out
 * (`../../flow-bootstrap/generation-failure/build-ending.ts`) -- when the failed
 * call carries one. The command's answer opens with it alone (`./progress.ts`).
 */
function buildEnding(response: AutomationStudioConversationCommandCallResult): string | undefined {
  const ending = (response.payload as { diagnostic?: { ending?: { message?: unknown } } } | undefined)?.diagnostic?.ending?.message;
  return typeof ending === "string" && ending.trim() ? ending.trim() : undefined;
}

/** Whether the failed build kept an incomplete draft for the next build to carry on from: its diagnostic names one with at least one step. */
function keptDraft(response: AutomationStudioConversationCommandCallResult): boolean {
  const draft = (response.payload as { diagnostic?: { evidenceLoop?: { incompleteDraft?: { steps?: unknown } } } } | undefined)?.diagnostic?.evidenceLoop?.incompleteDraft;
  return typeof draft?.steps === "number" && draft.steps > 0;
}
