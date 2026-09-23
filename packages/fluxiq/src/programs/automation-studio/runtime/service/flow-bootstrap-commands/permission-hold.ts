import { assertAutomationStudioBootstrapPermissionRequestAnswered, type AutomationStudioBootstrapAdaptation } from "../../flow-bootstrap/index.ts";

// Whether a build that asked for permission may go any further, read from the
// thread it asked in.
//
// The adaptation records which request it carries; the conversation records how
// that request was answered. Neither alone can say whether the person agreed,
// and keeping the answer on the adaptation as well would be a second copy of
// something that changes after the adaptation is written. So the id is the
// join -- the request is the ask -- and this is the one place that follows it.

/** What this needs of the conversation store: one ask, by the id the gate minted. */
export type AutomationStudioBootstrapAskReader = {
  available: boolean;
  getAsk(input: { projectId: string; askId: string }): Promise<{ answer: { kind: string } | null } | null>;
};

/**
 * Throws unless the adaptation carries no permission request, or carries one
 * the person granted.
 *
 * A store that cannot be read is not caught here. "The answer could not be
 * read" and "there is no answer" are different facts, and reading the second
 * out of the first would tell a person their grant had not registered; the
 * store's own error says what actually went wrong. Either way nothing is
 * released, which is the direction that matters.
 */
export async function assertAutomationStudioBootstrapPermissionAnswered(
  adaptation: AutomationStudioBootstrapAdaptation,
  asks: AutomationStudioBootstrapAskReader | undefined
): Promise<void> {
  const request = adaptation.permissionRequest;
  if (!request) return;
  const ask = asks?.available ? await asks.getAsk({ projectId: adaptation.projectId, askId: request.requestId }) : null;
  assertAutomationStudioBootstrapPermissionRequestAnswered(adaptation, ask?.answer?.kind ?? null);
}
