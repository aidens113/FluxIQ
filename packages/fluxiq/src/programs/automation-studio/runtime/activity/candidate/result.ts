import { automationStudioActivityCandidateSubmissionWords } from "./submission-words.ts";
import { automationStudioActivityCandidateTrialWords } from "./trial-words.ts";

/** `core.submit_candidate` (`../../flow-bootstrap/candidate/authoring-loop.ts`), read as a plain string so this module does not reach into the loop. */
const SUBMIT_CANDIDATE = "core.submit_candidate";
/** `core.test_candidate` (`../../flow-bootstrap/candidate/trial-gate.ts`). */
const TEST_CANDIDATE = "core.test_candidate";

/**
 * How a candidate build's own call ended, for the closing row of its card
 * (t373): its status, the record part its words go in (`Said` for a call that
 * ran, `Declined` for one Core refused before doing any of it; the shared card
 * reads both, `../../../../ui/activity-action/record.ts`), those words, and the
 * few words the row's status sentence ends with. Nothing for any other tool, or for an
 * answer of another shape, whose row is said as before.
 *
 * Before t373 neither call had a row: the authoring loop ran both outside the
 * observed `executeTool`, so the chat showed no card for writing or testing the
 * Flow (t366).
 */
export function automationStudioActivityCandidateResult(toolId: string, result: unknown): { status: "succeeded" | "failed"; part: "Said" | "Declined"; words: string; outcome: string } | undefined {
  const answer = result && typeof result === "object" && !Array.isArray(result) ? result as { kind?: unknown; resultCode?: unknown; evidence?: unknown } : undefined;
  if (answer?.kind !== "llm_evidence_tool_execution") return undefined;
  if (toolId === SUBMIT_CANDIDATE) {
    const said = automationStudioActivityCandidateSubmissionWords(answer.evidence);
    if (!said) return undefined;
    return said.declined
      ? { status: "failed", part: "Declined", words: said.words, outcome: "not done" }
      : { status: "succeeded", part: "Said", words: said.words, outcome: "done" };
  }
  if (toolId !== TEST_CANDIDATE) return undefined;
  const said = automationStudioActivityCandidateTrialWords(answer);
  if (!said) return undefined;
  if (said.declined) return { status: "failed", part: "Declined", words: said.words, outcome: "not done" };
  return said.failed
    ? { status: "failed", part: "Said", words: said.words, outcome: "didn't pass" }
    : { status: "succeeded", part: "Said", words: said.words, outcome: "passed" };
}
