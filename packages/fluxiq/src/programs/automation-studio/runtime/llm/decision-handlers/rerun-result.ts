// A rerun whose argument changed but whose result did not (live run
// `run-mux6naez-6c20f26e`, lane C round 3, R3-2).
//
// The model reran its list read with one condition list, then another close
// to it, then the first again: six reruns read the same 13 rows. Each changed
// the step's argument, so the draft changed and each read as progress, and the
// repeat guard -- keyed on the decision and the draft -- saw six different
// decisions. Their answers differed only in when the read ran and the id of the
// command that ran it. So a rerun that took its step's place is compared with
// what that step found when it ran: the same answer, those per-run fields
// aside, means the change made no difference to the result. That is no
// progress (`./refused-repeat.ts`, `automationStudioLlmEvidenceRerunChangedNothing`),
// and the model is told so under its own tool id, beside the answer.
import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import { automationStudioLlmDecisionContextSupersede } from "../decision-context/index.ts";
import type { AutomationStudioLlmEvidenceEntry } from "../context-window.ts";
import type { AutomationStudioLlmEvidenceDecisionHandlerContext } from "./types.ts";

/** The evidence entry a rerun that found what its step had already found is told under. */
export const AUTOMATION_STUDIO_LLM_EVIDENCE_RERUN_RESULT_TOOL_ID = "core.rerun_result";

// Fields that say when and as which command a call ran, not what it found: they
// differ on every run of the same read (`run-mux6naez-6c20f26e`, 0036-0062).
const PER_RUN_KEYS = new Set(["commandId", "startedAt", "finishedAt"]);

// What Core writes onto a rerun's answer about where it ran (`../node-tools/step-place.ts`): about the rerun, not what it found.
const RERUN_PLACE_KEY = "rerunPlace";

// A rerun answered as a check of a done lasting act ran nothing (`../node-tools/rerun-check.ts`), so it found nothing to compare.
const RERUN_CHECK_KEY = "rerunCheck";

/**
 * What the call `callId` found, as one comparable string -- its answer as the
 * model was shown it, the per-run fields and where a rerun ran aside -- or
 * nothing when the evidence no longer holds it or the call ran only a check.
 */
export function automationStudioLlmEvidenceAnswerKey(evidence: readonly AutomationStudioLlmEvidenceEntry[], callId: string | undefined): string | undefined {
  if (callId === undefined) return undefined;
  const entry = [...evidence].reverse().find((candidate) => candidate.callId === callId);
  if (entry === undefined) return undefined;
  const value = entry.value;
  if (value === null || typeof value !== "object" || Array.isArray(value)) return JSON.stringify(withoutPerRunKeys(value));
  if (RERUN_CHECK_KEY in value) return undefined;
  const { [RERUN_PLACE_KEY]: _place, ...found } = value;
  return JSON.stringify(withoutPerRunKeys(found));
}

/** Tells the model that the rerun of step `step` found exactly what the step had found before. */
export function automationStudioLlmEvidenceTellRerunSameResult(context: AutomationStudioLlmEvidenceDecisionHandlerContext, iteration: number, step: number): void {
  const value: JsonObject = {
    ok: false,
    code: "llm_evidence_loop.rerun_same_result",
    step,
    instruction: `The rerun of step ${step} changed its argument, but it found exactly what step ${step} found before: the change made no difference to what step ${step} found, so this rerun counts toward stopping this exploration. `
      + `Do not rerun step ${step} again with a near-identical argument. If what it found is what the instruction asks for, go on from it -- do the act, or complete. Otherwise change what decides the result, or look at the page first to see why it stays the same.`
  };
  context.accountEvidence(value);
  automationStudioLlmDecisionContextSupersede(context.evidence, AUTOMATION_STUDIO_LLM_EVIDENCE_RERUN_RESULT_TOOL_ID);
  context.evidence.push({ callId: `${AUTOMATION_STUDIO_LLM_EVIDENCE_RERUN_RESULT_TOOL_ID}.${iteration}`, toolId: AUTOMATION_STUDIO_LLM_EVIDENCE_RERUN_RESULT_TOOL_ID, value });
}

function withoutPerRunKeys(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return value.map(withoutPerRunKeys);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => !PER_RUN_KEYS.has(key)).map(([key, item]) => [key, withoutPerRunKeys(item as JsonValue)]));
}
