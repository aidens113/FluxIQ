// What a build that continues an exhausted one is told before its first
// decision.
//
// A build that ran out of decisions used to leave nothing behind: its draft
// went with it, and `run-mulx76vv-a882551e` discarded twelve proved steps. The
// caller now keeps that draft as an incomplete record
// (`../../flow-bootstrap/incomplete-draft/`) and a continuation seeds the loop
// from it (`../loop-configuration.ts`, `draft.seed` and `draft.resume`). Two
// things make the seed a continuation rather than a stale list:
//
//   - **The page is put where the draft leaves it.** A continuation starts where
//     the Flow starts, not where the last build stopped, so before the first
//     decision the loop replays the draft through its own dry run -- the same
//     replay a completion is gated on, with no provider call. A draft that no
//     longer replays says so as ordinary dry-run evidence, which is exactly
//     what the model then has to correct.
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

const MAX_OUTSTANDING = 16;

const INSTRUCTION = "This build continues one that ran out of decisions before it finished. "
  + "Your draft is the steps it proved, and they have just been run again from where the Flow starts, so the page is where your draft leaves it; "
  + "if a core.dry_run entry follows, a step did not replay and that is the first thing to correct. "
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
    outstanding: resume.outstandingIssueCodes.filter((code) => /^[a-z0-9_.:-]{1,100}$/iu.test(code)).slice(0, MAX_OUTSTANDING),
    instruction: INSTRUCTION
  };
  return { callId: `${AUTOMATION_STUDIO_LLM_EVIDENCE_RESUMED_TOOL_ID}.0`, toolId: AUTOMATION_STUDIO_LLM_EVIDENCE_RESUMED_TOOL_ID, value };
}
