import { automationStudioActivityCandidateSubmissionWords } from "./submission-words.ts";
import { automationStudioActivityCandidateTrialWords } from "./trial-words.ts";

/**
 * A tool that sends the steps a builder wrote, to be checked and saved: a
 * candidate build's whole Flow (`core.submit_candidate`,
 * `../../flow-bootstrap/candidate/authoring-loop.ts`) and a project builder's
 * part of it (`core.submit_subflow`,
 * `../../flow-bootstrap/subflow-candidate/submit-tool.ts`). Read as a plain
 * pattern so this module does not reach into the loop.
 */
const SUBMIT = /^core\.submit_[a-z_]+$/u;
/** A tool that tests those steps: `core.test_candidate` (`../../flow-bootstrap/candidate/trial-gate.ts`), `core.test_subflow` (`../../flow-bootstrap/subflow-candidate/subflow-trial-gate.ts`). */
const TEST = /^core\.test_[a-z_]+$/u;
/**
 * A part's trial gate refuses under the candidate gate's codes in its own
 * namespace (`subflow.trial_stale_revision` beside `candidate.trial_stale_revision`):
 * read under the candidate's, whose words say the same.
 */
const SUBFLOW_TRIAL_CODE = /^subflow\.(trial_[a-z_]+)$/u;

/**
 * How a build's own call that saves or tests the steps it wrote ended, for the
 * closing row of its card (t373): its status, the record part its words go in
 * (`Said` for a call that ran, `Declined` for one Core refused before doing any
 * of it; the shared card reads both, `../../../../ui/activity-action/record.ts`),
 * those words, and the few words the row's status sentence ends with, and
 * `unchanged` on a submission refused as the same Flow sent again. Nothing for
 * any other tool, or for an answer of another shape, whose row is said as
 * before.
 *
 * Before t373 neither call had a row: the authoring loop ran both outside the
 * observed `executeTool`, so the chat showed no card for writing or testing the
 * Flow (t366). Before t649 only a candidate build's own tools were read here:
 * a project builder's `core.submit_subflow` refused under a code with no
 * failing word in it ended "succeeded", and its card read a green "Done"
 * (A8 frozen pair 3, `run-mv9zn5ob-d929084d`, screenshot 00012).
 */
export function automationStudioActivityCandidateResult(toolId: string, result: unknown): { status: "succeeded" | "failed"; part: "Said" | "Declined"; words: string; outcome: string; unconfirmed?: true; unchanged?: true } | undefined {
  const answer = result && typeof result === "object" && !Array.isArray(result) ? result as { kind?: unknown; resultCode?: unknown; evidence?: unknown } : undefined;
  if (answer?.kind !== "llm_evidence_tool_execution") return undefined;
  if (SUBMIT.test(toolId)) {
    const said = automationStudioActivityCandidateSubmissionWords(answer.evidence);
    if (!said) return undefined;
    return said.declined
      ? { status: "failed", part: "Declined", words: said.words, outcome: "not done", ...(said.unchanged ? { unchanged: true as const } : {}) }
      : { status: "succeeded", part: "Said", words: said.words, outcome: "done" };
  }
  if (!TEST.test(toolId)) return undefined;
  const said = automationStudioActivityCandidateTrialWords(asCandidateTrial(answer));
  if (!said) return undefined;
  if (said.declined) return { status: "failed", part: "Declined", words: said.words, outcome: "not done" };
  return said.failed
    ? { status: "failed", part: "Said", words: said.words, outcome: "didn't pass", ...(said.unconfirmed ? { unconfirmed: true as const } : {}) }
    : { status: "succeeded", part: "Said", words: said.words, outcome: "passed" };
}

/** `answer` with a part's trial refusal code read under the candidate's (`SUBFLOW_TRIAL_CODE`). */
function asCandidateTrial(answer: { resultCode?: unknown; evidence?: unknown }): { resultCode?: unknown; evidence?: unknown } {
  const candidate = (code: unknown): unknown => (typeof code === "string" ? code.replace(SUBFLOW_TRIAL_CODE, "candidate.$1") : code);
  const evidence = answer.evidence && typeof answer.evidence === "object" && !Array.isArray(answer.evidence) ? answer.evidence as Record<string, unknown> : undefined;
  return { resultCode: candidate(answer.resultCode), evidence: evidence && "code" in evidence ? { ...evidence, code: candidate(evidence.code) } : answer.evidence };
}
