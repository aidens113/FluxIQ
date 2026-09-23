import type { AutomationStudioLlmEvidenceRuntimeBinding } from "../../llm/index.ts";

// The state digest a build takes either side of each step it runs.
//
// The hook the evidence loop offers names a call and a tool and nothing else,
// because the loop asks the same question twice and does not care which side of
// the step it is on. The domain's hook needs to know: it is asked once before
// the action and once after it, and the two answers are what say whether the
// step changed anything (`runtime/recovery/exploration-state/digest-source.ts`).
// So the side is tracked here, by the call it belongs to -- the first answer for
// a call is its "before", the second its "after" -- rather than being derived
// one from the other, which would make the loop's own state-chain check vacuous.
//
// Without this the reduction has no chain to walk for a build: a build's steps
// were recorded with no digests at all, while the recovery exploration, whose
// binding is wired the same way one directory over, had them from the start.

/**
 * The evidence loop's `captureStateDigest` for one build, or nothing when the
 * bound domain cannot observe its own state.
 *
 * A domain that says nothing leaves the step without digests, which the
 * reduction reports rather than treats as a failure.
 */
export function automationStudioBootstrapStateDigestHook(
  binding: AutomationStudioLlmEvidenceRuntimeBinding | undefined,
  context: { projectId: string; flowId: string }
): ((input: { callId: string; toolId: string; signal?: AbortSignal }) => Promise<string | undefined>) | undefined {
  const capture = binding?.captureStateDigest?.bind(binding);
  if (!capture) return undefined;
  const asked = new Set<string>();
  return (input) => {
    const phase = asked.has(input.callId) ? "after" : "before";
    asked.add(input.callId);
    return capture({
      projectId: context.projectId,
      flowId: context.flowId,
      callId: input.callId,
      toolId: input.toolId,
      phase,
      ...(input.signal ? { signal: input.signal } : {})
    });
  };
}
