// Whether any reply reached a build that ended because its model provider
// stopped answering (t619).
//
// A8 canary `run-mv8zw5l2-98064abf`: every call of the build timed out, and
// its diagnostic still said `providerResponse: "received"`, the state every
// ending past the request stage implied. A build whose calls all failed
// before anything arrived now says `not_received`
// (`./failure-state.ts`, `acceptedProviderResponses`).
//
// What is known, and from where: the stopped loop knows whether any of its own
// decision calls got a reply (`../../llm/unanswered-calls.ts`, `replied`); an
// earlier round could only have ended on replies; and any call that got one
// with a cost -- the instruction reading, a judge, a builder -- is in the
// build's accounting as tokens the provider reported. Where the loop did not
// say, a reply is assumed, as every ending past the request stage always has.
import type { AutomationStudioLlmEvidenceLoopProviderUnavailable } from "../../llm/index.ts";
import type { AutomationStudioFlowBootstrapBuildEnding } from "./build-ending.ts";
import type { AutomationStudioFlowBootstrapFailureDiagnostic } from "./diagnostic.ts";

/** Whether a reply reached the build a silent provider ended, so its diagnostic says `received`; false only when nothing did. */
export function flowBootstrapProviderReplyArrived(input: {
  providerUnavailable: AutomationStudioLlmEvidenceLoopProviderUnavailable | undefined;
  ending: AutomationStudioFlowBootstrapBuildEnding;
  accounting: AutomationStudioFlowBootstrapFailureDiagnostic["accounting"] | undefined;
}): boolean {
  if (input.providerUnavailable?.replied !== false) return true;
  if (input.ending.tried.rounds > 1) return true;
  return (input.accounting?.outputTokens ?? 0) > 0 || (input.accounting?.totalTokens ?? 0) > 0;
}
