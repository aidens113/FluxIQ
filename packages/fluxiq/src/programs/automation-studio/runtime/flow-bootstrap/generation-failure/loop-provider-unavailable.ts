// A build's evidence loop ended because the model provider stopped answering:
// the ending that says exactly that, for every authoring mode that publishes
// its loop's own ending (`./evidence-failure.ts`).
//
// **The failure this closes (A8 canary `run-mv8zw5l2-98064abf`, t619).**
// During a DeepSeek outage the project supervisor's three decisions each
// waited out their deadline as `llm.provider_timeout`, and the loop ended
// `llm_evidence_loop.provider_unavailable` (`../../llm/unanswered-calls.ts`),
// as it should. Its build then published that ending as
// `flow_bootstrap.provider_timeout` at the stage after the request, a pair the
// diagnostic's own parse refuses, so the service's catch put the stage's code
// in its place: `flow_bootstrap.post_provider_validation_failed`. The person
// read "The supervisor ended the build: it could not finish the Flow" and "The
// build failed: what the model wrote could not be used". The model wrote
// nothing and the supervisor ended nothing. A candidate build met the same
// erasure on the same path.
//
// Now the loop's ending is `flow_bootstrap.provider_unavailable` with a
// message of Core's own: the AI model provider did not answer, or could not
// be reached; no Flow was built or changed; the instruction is kept; try again
// later. The legacy round says the same through its phases
// (`../unfinished-build/provider-unavailable.ts`), which also knows its
// checklist and what it kept. The provider's own message is never said: only
// the closed words `../../llm/unanswered-calls.ts` gives each code.
import type { AutomationStudioLlmEvidenceLoopProviderUnavailable, AutomationStudioLlmEvidenceLoopResult } from "../../llm/index.ts";
// Types only: `./build-ending.ts` is on a module cycle through `loop-limits/`, and this file stays off it.
import type { AutomationStudioFlowBootstrapBuildEnding } from "./build-ending.ts";

/** The provider code whose run is said as "could not be reached" rather than "did not answer" (the commonest of the run, `codes[0]`). */
const UNREACHABLE = "llm.provider_network_error";

/**
 * What the page holds after the loop, as the ending says it: `count` the
 * loop's own acts from its trace, for a loop that acts on the target itself;
 * `said_by_caller` where others acted for the loop (a project build's
 * builders), so its caller says what is left on the target after the message.
 */
export type AutomationStudioFlowBootstrapLoopPageSaid = "count" | "said_by_caller";

/** The ending of a build whose evidence loop the model provider stopped answering. */
export function flowBootstrapLoopProviderUnavailableEnding(
  result: Extract<AutomationStudioLlmEvidenceLoopResult, { ok: false }>,
  page: AutomationStudioFlowBootstrapLoopPageSaid = "count"
): AutomationStudioFlowBootstrapBuildEnding {
  const unanswered = result.providerUnavailable ?? fromTrace(result);
  const unreachable = unanswered.codes[0] === UNREACHABLE;
  const requests = unanswered.inARow === 1 ? "a request" : `${unanswered.inARow} requests in a row`;
  // "Could not be reached" is already what its code's words say, so they are not said twice.
  const happened = unreachable
    ? `The build stopped because the AI model provider could not be reached: ${requests} got no answer.`
    : `The build stopped because the AI model provider did not answer: ${requests} got no answer -- ${unanswered.said}.`;
  const changes = result.trace.filter((row) => row.decision === "tool_call" && row.effectApplied === true).length;
  const built = page === "said_by_caller"
    ? "Nothing was built: no Flow was created or changed."
    : changes
      ? `Nothing was built: no Flow was created or changed. The build had taken ${changes === 1 ? "one action" : `${changes} actions`} on the page before it stopped.`
      : "Nothing was built: no Flow was created or changed, and nothing on the page was changed.";
  // Core's words and counts alone, a few hundred characters at most: well inside what an ending's message may hold (`./build-ending.ts`).
  const message = [happened, built, "What the Flow should do is kept, so you can try again later, once the provider is answering."].join(" ");
  return {
    kind: "provider_unavailable",
    message,
    notDone: [],
    tried: {
      rounds: 1,
      decisions: new Set(result.trace.flatMap((row) => (row.iteration > 0 ? [row.iteration] : []))).size,
      stepsInFlow: result.steps.length,
      // What the build-ending record calls a test is the legacy round's replay of the Flow; this loop never ran one.
      tested: "not_tested"
    }
  };
}

/** The unbroken run of unanswered decisions at the end of a trace, for a result that did not carry its own summary. */
function fromTrace(result: Extract<AutomationStudioLlmEvidenceLoopResult, { ok: false }>): AutomationStudioLlmEvidenceLoopProviderUnavailable {
  const run: string[] = [];
  for (const row of [...result.trace].reverse()) {
    if (row.decision !== "unusable" || !row.resultCode) break;
    run.push(row.resultCode);
  }
  const reached = run.length > 0 && run.every((code) => code === UNREACHABLE);
  // Only an answered call breaks a run, so a row before it means something arrived.
  return { inARow: Math.max(1, run.length), codes: reached ? [UNREACHABLE] : [], said: reached ? "it could not be reached" : "it did not answer", replied: result.trace.length > run.length };
}
