// A candidate-mode build failure that says what the build wrote (t362).
//
// **Why.** Lane A round 4 (`run-muyrpbnk-fef374e7`) stopped for no progress
// after the model had written four valid revisions of a whole Flow and Core
// had test-run two of them. The failure carried the loop's code alone, so the
// chat said the Flow "has no steps yet" and the Lab recorded `candidate: null`:
// what was written, and what each test run was judged, went nowhere.
//
// So the latest revision Core accepted is kept as an unverified draft -- the
// same record a finished candidate build saves, never promotable without a yes
// for its exact revision and digest -- and the failure names the candidate,
// that revision, whether it was kept, and each trial's verdict
// (`../../flow-bootstrap/generation-failure/candidate-kept.ts`). Anything that
// is not one of Core's diagnostics, or that already names its candidate, is
// left as it came; so is a diagnostic that would not read back with it.
import {
  AutomationStudioFlowBootstrapGenerationError,
  automationStudioFlowBootstrapCandidateKept,
  parseAutomationStudioFlowBootstrapGenerationError
} from "../../flow-bootstrap/index.ts";
import type { AutomationStudioFlowCandidate } from "../../flow-bootstrap/candidate/index.ts";

/** `error` naming the candidate behind it, after `keep` was asked to save the latest accepted revision as a draft. */
export async function automationStudioFlowBootstrapFailureWithCandidate(error: unknown, input: {
  candidateId: string;
  /** The latest submission Core accepted, if any. */
  latest: AutomationStudioFlowCandidate | undefined;
  trials: ReadonlyArray<{ revision: number; verdict: string; trialRunId?: string | undefined; code?: string | undefined }>;
  /** Saves `candidate` as the build's unverified draft; false when it may not be kept. */
  keep(candidate: AutomationStudioFlowCandidate): Promise<boolean>;
}): Promise<unknown> {
  const diagnostic = parseAutomationStudioFlowBootstrapGenerationError(error);
  if (!diagnostic || diagnostic.candidate) return error;
  // The build's own failure is what it reports; a draft that could not be saved is said as "none", never in its place.
  const saved = input.latest ? await input.keep(input.latest).catch(/* best-effort: the build's failure is reported either way, and an unsaved draft reads as "none" */ () => false) : false;
  const candidate = automationStudioFlowBootstrapCandidateKept({
    candidateId: input.candidateId, draft: saved ? "saved" : "none",
    latest: input.latest ? { revision: input.latest.revision, digest: input.latest.digest } : undefined,
    trials: input.trials
  });
  const replaced = new AutomationStudioFlowBootstrapGenerationError({ ...diagnostic, candidate });
  return parseAutomationStudioFlowBootstrapGenerationError(replaced) ? replaced : error;
}
