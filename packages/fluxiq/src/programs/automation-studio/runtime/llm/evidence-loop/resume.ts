// What a build that continues an exhausted one is told before its first
// decision.
//
// A build that ran out of decisions used to leave nothing behind: its draft
// went with it, and `run-mulx76vv-a882551e` discarded twelve proved steps. The
// caller now keeps that draft as an incomplete record
// (`../../flow-bootstrap/incomplete-draft/`) and a continuation seeds the loop
// from it (`../loop-configuration.ts`, `draft.seed` and `draft.resume`). What
// makes the seed a continuation rather than a stale list:
//
//   - **It carries on live.** A continuation is still the build's live phase,
//     and nothing in that phase replays the draft from its first step (user,
//     2026-09-30: a full replay belongs to the judgement once the Flow is
//     declared ready, never to exploration). Until then the loop replayed the
//     whole draft before the first decision to put the page where the draft
//     leaves it. Now the model is told the page is wherever it stands and to
//     get to where its draft leaves off by the shortest way, without repeating
//     the draft; the Flow is tested in full once it says it is ready.
//   - **The model is told what it still owes.** The completion failures the last
//     build had not answered, by code, and why it stopped.
//
// Codes, counts and Core's own words only: nothing here is page content, so the
// entry rides where every other Core entry does.
import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioFlowDraftStep } from "../../flow-draft/index.ts";
import { automationStudioFlowDraftStepIsProposable } from "../../flow-draft/index.ts";
import type { AutomationStudioLlmEvidenceLoopExhaustedBound } from "./exhaustion.ts";

/** The evidence entry a continued build's first decision reads. */
export const AUTOMATION_STUDIO_LLM_EVIDENCE_RESUMED_TOOL_ID = "core.resumed";

/** What a continuation is told about the build it continues. */
export type AutomationStudioLlmEvidenceLoopResume = {
  /** Which version of the incomplete draft this continues, counting from 1. */
  revision: number;
  /**
   * Which allowance the build it continues ran out of, or `unusable_decisions`
   * when that build ended because its decisions kept coming back unusable --
   * most often completions the checks kept refusing -- rather than on a count.
   */
  stopped: AutomationStudioLlmEvidenceLoopExhaustedBound | "unusable_decisions";
  /** The completion failures that build had not answered, by issue code. */
  outstandingIssueCodes: readonly string[];
};

const INSTRUCTION = "This build continues one that ran out of decisions before it finished. "
  + "Your draft is the steps it proved. They were not run again: the page is wherever it now stands, so look first, and if it is not where your draft leaves off, get there the shortest way and mark any step you take only to get there exploratory (amend_draft) so the Flow does not repeat it. "
  + "The whole Flow is run once from where it starts when you complete, and a step that does not replay then is what you correct. "
  + "outstanding is what refused its last attempt to finish: correct each one, do whatever the instruction asks that your draft does not yet do, and complete. "
  + "Do not repeat work the draft already holds.";

/** The entry itself, under a call id of its own. */
export function automationStudioLlmEvidenceResumeEntry(
  resume: AutomationStudioLlmEvidenceLoopResume,
  steps: readonly AutomationStudioFlowDraftStep[]
): { callId: string; toolId: string; value: JsonObject } {
  const value: JsonObject = {
    code: "llm_evidence_loop.resumed",
    revision: Number.isSafeInteger(resume.revision) && resume.revision > 0 ? resume.revision : 1,
    stopped: resume.stopped,
    draftSteps: steps.length,
    proposableSteps: steps.filter((step) => step.disposition === "kept" && automationStudioFlowDraftStepIsProposable(step)).length,
    outstanding: resume.outstandingIssueCodes.filter((code) => /^[a-z0-9_.:-]{1,100}$/iu.test(code)),
    instruction: INSTRUCTION
  };
  return { callId: `${AUTOMATION_STUDIO_LLM_EVIDENCE_RESUMED_TOOL_ID}.0`, toolId: AUTOMATION_STUDIO_LLM_EVIDENCE_RESUMED_TOOL_ID, value };
}
