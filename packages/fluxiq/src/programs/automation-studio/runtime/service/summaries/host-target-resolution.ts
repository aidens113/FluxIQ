// The host's own account of how it found the element, projected out of a saved
// attempt's outputs so a finished run can still say it.
//
// There are two records both called a target resolution and they answer
// different questions. Core's `AutomationNodeTargetResolution` is its
// *pre-dispatch* choice of candidate, and the run detail already carries it at
// `metadata.targetResolution`. The host's is what the browser actually did
// once the command arrived: `WebAutomationTargetResolution` in the downstream
// domain, carrying the `strategy` it succeeded by. It reaches Core inside the
// dispatched result payload, which `runtime/io-policy.ts` puts on the node's
// `outputs.result`, and nothing carried it any further -- so a run that
// recovered a renamed control by scoring candidates instead of its recorded
// selector looked, in every stored record, exactly like one that matched the
// selector outright.
//
// That difference is a recovery rung. The executor's ladder has no
// re-resolve-the-target rung because the host has already done it before Core
// is ever told the action failed (`runtime/executor/recovery-ladder.ts`), so
// the strategy on a *succeeded* attempt is the only evidence that rung ran at
// all.
//
// Every member admitted here is a closed enum or a finite number. The domain
// states that as a property of its own type -- nothing on it is derived from
// the page, and a test there pins that it has not grown a string -- and this
// projection re-checks it rather than trusting it, because the payload arrives
// from a downstream host and is parsed, not typed.
import type { JsonObject } from "../../../../../core/index.ts";
import { isJsonRecord } from "../json-values.ts";

/** The strategies the web host reports (`domain/src/actions/types.ts`, `WebAutomationTargetStrategy`). */
const HOST_TARGET_STRATEGIES = new Set(["selector", "coordinates", "visual-target", "fingerprint", "active-element", "scored-candidate"]);

/** A score the host reports, which is a ratio; anything outside it is not one of its numbers. */
function score(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1 ? value : undefined;
}

/**
 * The host's resolution, rebuilt member by member, or `undefined` when the
 * attempt dispatched nothing, the host reported no resolution, or the result
 * payload was withheld (a dispatch that saves records keeps a marker in its
 * place). A record without a strategy this Core knows is treated as absent
 * rather than passed through, so a member the domain adds later stays behind
 * until it is named here.
 *
 * It is looked for at two depths because a dispatch takes one of two routes
 * and they nest the answer differently. A *runtime*-dispatched output
 * (`createRuntimePolicyEffectDispatcher`) puts the client's own action-result
 * payload straight onto `outputs.result`. An output dispatched through the IO
 * registry, which is the route a paired browser client takes, is answered by
 * the domain's gateway dispatcher, and that wraps the same payload as
 * `{ status, message, result }` -- so the action result is one level further
 * in. Reading only the first shape is why this measurement was absent from
 * every real run while its unit tests passed.
 */
export function hostTargetResolutionFromOutputs(outputs: unknown): JsonObject | undefined {
  if (!isJsonRecord(outputs) || !isJsonRecord(outputs.result)) return undefined;
  const dispatched = isJsonRecord(outputs.result.result) ? outputs.result.result : outputs.result;
  const resolution = dispatched.resolution;
  if (!isJsonRecord(resolution)) return undefined;
  const strategy = resolution.strategy;
  const candidateCount = resolution.candidateCount;
  if (typeof strategy !== "string" || !HOST_TARGET_STRATEGIES.has(strategy)) return undefined;
  if (!Number.isSafeInteger(candidateCount) || (candidateCount as number) < 0) return undefined;
  const bestScore = score(resolution.bestScore);
  const runnerUpScore = score(resolution.runnerUpScore);
  const confidence = score(resolution.confidence);
  return {
    strategy,
    candidateCount: candidateCount as number,
    ...(bestScore === undefined ? {} : { bestScore }),
    ...(runnerUpScore === undefined ? {} : { runnerUpScore }),
    ...(confidence === undefined ? {} : { confidence })
  };
}
