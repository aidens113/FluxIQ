// A step the domain found already done by the page itself (t775).
//
// Builds stop putting the site back before a trial (user, 2026-10-27), so a
// step that flips a control between two states carries `ensureState`, the
// domain's own word for the state it asks for
// (`../../flow-bootstrap/script-statements/toggle-idempotent.ts`). On a page
// already in that state the domain presses nothing and answers
// `skipped: "already_in_state"` in its action result, which the runtime keeps
// under the node outputs' `result` (`../../io-policy.ts`); one written among the
// outputs directly is read the same way.
//
// Such an attempt is not a lasting act this run made: it reads `succeeded`, by
// its own `success` route, with `skipped: { reason: "already_in_state" }`, so
// the effect check does not hold it to an effect it never had
// (`./recorded-effect.ts`), the completed-act ledger does not record it
// (`../step-loop/already-done.ts`), and a trial's landed acts leave it out and
// list it apart (`../../service/candidate-trial/landed-acts.ts`). The chat says
// it was already so (`../step-loop/already-done.ts`,
// `automationStudioStepSaidAlreadyInState`). Anything but a succeeded attempt
// saying exactly that is left as it was.

import type { AutomationStudioNodeAttemptTrace } from "../contracts.ts";

/** The closed code an attempt the page already satisfied carries. */
const ALREADY_IN_STATE_CODE = "executor.act.already_in_state";

/** The attempt, marked skipped as already in its asked state where the domain said so (header). */
export function automationStudioAttemptAlreadyInState(attempt: AutomationStudioNodeAttemptTrace): AutomationStudioNodeAttemptTrace {
  if (attempt.status !== "succeeded" || attempt.skipped || !saidAlreadyInState(attempt.outputs)) return attempt;
  return { ...attempt, skipped: { reason: "already_in_state", code: ALREADY_IN_STATE_CODE } };
}

/** Whether the outputs say the page was already in the asked state: directly, or in the action result the runtime keeps (header). */
function saidAlreadyInState(outputs: AutomationStudioNodeAttemptTrace["outputs"]): boolean {
  if (outputs.skipped === "already_in_state") return true;
  const result = outputs.result;
  return typeof result === "object" && result !== null && !Array.isArray(result) && result.skipped === "already_in_state";
}
