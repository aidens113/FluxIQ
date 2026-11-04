// A person's Stop still returns the attempt's answer.
//
// **Why it needs a seam.** The build's cancellation scope throws on its way out whenever the
// scope was aborted, whatever the work inside returned (`../../flow-bootstrap-commands/cancellation.ts`),
// so an attempt that ended properly on a Stop would reach its caller as an `AbortError`. That
// is the one thing this path promises never to be: "a normal return whatever the ending".
// So every ending is held here under the call's own input object, and the service's outermost
// line asks for it when the scope threw. Held by the object, it cannot outlive its call or
// answer for a later one, and a Stop before the attempt began finds nothing and rethrows.

import type { AutomationStudioGenerateFlowBootstrapAdaptationAnswered } from "../../flow-bootstrap-commands/index.ts";

const HELD = new WeakMap<object, AutomationStudioGenerateFlowBootstrapAdaptationAnswered>();

/** Holds an attempt's answer for its call (header). */
export function automationStudioAnswerFirstHoldAnswer(request: object, answer: AutomationStudioGenerateFlowBootstrapAdaptationAnswered): void {
  HELD.set(request, answer);
}

/** The answer a cancelled call's attempt ended with, or the same error rethrown (header). */
export function automationStudioAnswerFirstAnswerOnStop(request: object, error: unknown): AutomationStudioGenerateFlowBootstrapAdaptationAnswered {
  const held = HELD.get(request);
  if (!held || (error as { name?: unknown } | null)?.name !== "AbortError") throw error;
  return held;
}
