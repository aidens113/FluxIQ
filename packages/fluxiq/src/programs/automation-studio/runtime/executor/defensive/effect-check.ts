// The effect check: the one question asked of a lasting act whose outcome is
// uncertain, before any retry, route or alternative (state-aware recovery plan,
// C6 step 4 and C8).
//
// **One hook, every path.** A build exploring or testing its draft passes one to
// the outside-graph retries (`../outside-graph/retries.ts`); a graph run builds
// one from the host's waiting expectation evaluation of the node's
// `expectedState` (`../transition-comparison.ts`, `automationStudioHostEffectCheck`).
// Both have this shape and both are settled by `automationStudioRunEffectCheck`.
//
// **Three answers, and `unknown` is the honest default.** `landed`: the act took
// effect, so the node is done. `not_landed`: it did not, so making it again is
// not a second act. `unknown`: nothing showed either way -- no expected state,
// no host to ask, a page that never answered, a check that threw. A missing
// acknowledgement is `unknown`, never `not_landed`.
//
// **The client is asked first, by command id.** A command whose answer never
// came is not called timed out until the client gateway has asked the client
// it was sent to what became of it (`client-gateway/service/command-reconcile/`),
// a question answered from what the client kept and never by acting. `landed`
// settles the attempt with the result it kept, so it never reaches this check
// and nothing is pressed again; `not_seen` settles it as a failure that did
// nothing (`effect: "unacted"`), so the ordinary retry follows; `running`
// (asked again after one bounded wait) and `unknown`, or a client that does not
// answer such questions, leave it `timed_out` as before -- and that is what
// arrives here, to be judged by the node's expected state or stop as Outcome
// uncertain. Core never presses again on `unknown`.

/** What the effect check answered about a lasting act whose outcome was uncertain. */
export type AutomationStudioEffectCheckResult = "landed" | "not_landed" | "unknown";

/**
 * The caller's own check of whether a lasting act took effect, asked only after
 * an attempt whose failure left that unknown: `landed`, `not_landed` (it did
 * not happen, so making it again is not a second act) or `unknown`.
 */
export type AutomationStudioLastingActCheck<T> = (result: T, attempt: number) => Promise<AutomationStudioEffectCheckResult>;

/**
 * Asks the check, with `unknown` for no check and for a check that threw: a
 * check that broke says nothing about the page, and reading it as `not_landed`
 * would make the act a second time.
 */
export async function automationStudioRunEffectCheck<T>(check: AutomationStudioLastingActCheck<T> | undefined, result: T, attempt: number): Promise<AutomationStudioEffectCheckResult> {
  if (!check) return "unknown";
  try {
    const answer = await check(result, attempt);
    return answer === "landed" || answer === "not_landed" ? answer : "unknown";
  } catch {
    return "unknown";
  }
}
