// The diagnosis the rest of the loop reads, as fields rather than as prose.
//
// Before this, "the diagnosis" was a sentence. The patch call fired whenever
// that sentence arrived, so the loop could not tell a diagnosis that asked for
// a repair from one that said a person must sign in -- both were strings, and a
// string is not a decision. Everything downstream therefore had to guess, and
// the cheapest guess was "always patch".
//
// This module turns the two things Core actually has -- the deterministic
// classification, and whatever structure the model's response carries -- into
// one record with named fields and a stated provenance for each. The plan reads
// this; nothing downstream reads the sentence.
//
// **The deterministic answer is the default, and the model may narrow it, not
// overturn it.** Where Core knows a person must act -- `auth_required`,
// `user_intervention_required` -- a model claim that the goal is still
// reachable is refused and recorded as refused. A model may say "no patch is
// needed" when Core assumed one was, because that only reduces what happens; it
// may not talk Core past a control.
//
// **What is recorded is not what is carried.** The record written onto a run is
// `summarizeAutomationStudioRuntimeStructuredDiagnosis` -- verdicts, counts and
// provenance, never the model's prose. The prose is the model's reading of a
// page whose contents Core deliberately does not store; a run record that
// quoted it back would be a copy of the page in storage under another name.
// This is the same rule `context-summary.ts` follows, for the same
// reason.
//
// **Known limitation, stated rather than hidden, and stronger than it looks.**
// The model cannot supply any of these fields today, and not merely because no
// prompt asks for one. `parseAutomationStudioLlmProviderResult` calls
// `stripAutomationStudioLlmResponseMetadata` on every structured response, so a
// `diagnosis` reaches this module as `summary` and `confidence` and nothing
// else -- the `metadata` channel is closed on purpose, to stop a model
// smuggling arbitrary JSON past the recognized-field allowlist. Reading it here
// is therefore the forward-compatible half of a contract whose other half is a
// diff to `AS/runtime/llm/**`, which this phase does not own: the four verdict
// fields have to become recognized fields of the `diagnosis` variant. Until
// that lands, `modelFields` is empty in the shipped app and every verdict below
// is the deterministic answer. A test pins that, so the day the diff lands the
// pin fails and somebody updates it deliberately. The exact diff is in this
// phase's report.

import type { JsonObject, JsonValue } from "../../../../core/index.ts";
import type { AutomationStudioLlmTaskResult } from "../llm/index.ts";
import type {
  AutomationStudioRuntimeDeterministicDiagnosis,
  AutomationStudioRuntimeDiagnosisAchievability
} from "./deterministic-diagnosis.ts";

/** The longest a model-supplied description may be before it is refused. */
export const AUTOMATION_STUDIO_STRUCTURED_DIAGNOSIS_TEXT_MAX_LENGTH = 500;

/** The model-supplied fields, named once so the reader and the summary agree. */
export const AUTOMATION_STUDIO_STRUCTURED_DIAGNOSIS_MODEL_FIELDS = Object.freeze([
  "expected",
  "observed",
  "changed",
  "stillAchievable",
  "deterministicRecoveryPossible",
  "explorationNeeded",
  "patchNeeded"
] as const);

export type AutomationStudioStructuredDiagnosisModelField =
  (typeof AUTOMATION_STUDIO_STRUCTURED_DIAGNOSIS_MODEL_FIELDS)[number];

export type AutomationStudioRuntimeStructuredDiagnosis = {
  schemaVersion: "automation-studio.structured-diagnosis.v1";
  failureClass: AutomationStudioRuntimeDeterministicDiagnosis["failureClass"];
  candidateKind: AutomationStudioRuntimeDeterministicDiagnosis["candidateKind"];
  /**
   * `model` means a diagnosis call succeeded and its answer was read; it does
   * not mean the model changed any verdict. `modelFields` says what it actually
   * supplied, and is empty until Core stops stripping response metadata.
   */
  source: "deterministic" | "model";
  /** What the run expected, as the model described it. Never recorded on a run. */
  expected?: string;
  /** What the run observed instead. Never recorded on a run. */
  observed?: string;
  /** What changed, as the model described it. Never recorded on a run. */
  changed?: string;
  stillAchievable: AutomationStudioRuntimeDiagnosisAchievability;
  deterministicRecoveryPossible: AutomationStudioRuntimeDiagnosisAchievability;
  /** The diagnosis asks for evidence to be gathered before anything is changed. */
  explorationNeeded: boolean;
  /** The diagnosis asks for a change to the Flow. The one gate on the patch call. */
  patchNeeded: boolean;
  confidence?: number;
  /** Which fields above the model actually supplied. Empty means all deterministic. */
  modelFields: AutomationStudioStructuredDiagnosisModelField[];
  /** Every model field that was refused, and why. Never silently dropped. */
  refusals: string[];
};

/** The counts-and-verdicts record written onto a run. Carries no model prose. */
export type AutomationStudioStructuredDiagnosisSummary = Omit<
  AutomationStudioRuntimeStructuredDiagnosis,
  "expected" | "observed" | "changed"
> & { describedFieldCount: number };

export type AutomationStudioRuntimeStructuredDiagnosisInput = {
  deterministic: AutomationStudioRuntimeDeterministicDiagnosis;
  /** The diagnosis call's result, when one was made. Absent means none was. */
  result?: AutomationStudioLlmTaskResult;
};

/**
 * The structured diagnosis: Core's classification, refined by whatever the
 * model's response carried and could be trusted to carry.
 */
export function buildAutomationStudioRuntimeStructuredDiagnosis(
  input: AutomationStudioRuntimeStructuredDiagnosisInput
): AutomationStudioRuntimeStructuredDiagnosis {
  const deterministic = input.deterministic;
  const base: AutomationStudioRuntimeStructuredDiagnosis = {
    schemaVersion: "automation-studio.structured-diagnosis.v1",
    failureClass: deterministic.failureClass,
    candidateKind: deterministic.candidateKind,
    source: "deterministic",
    stillAchievable: deterministic.stillAchievable,
    deterministicRecoveryPossible: deterministic.deterministicRecoveryAvailable ? "yes" : "unknown",
    explorationNeeded: false,
    patchNeeded: deterministicPatchNeeded(deterministic),
    modelFields: [],
    refusals: []
  };
  const response = input.result?.ok === true && input.result.response?.kind === "diagnosis" ? input.result.response : undefined;
  if (!response) return base;
  const reported = isRecord(response.metadata) ? response.metadata : {};
  const refusals: string[] = [];
  const modelFields: AutomationStudioStructuredDiagnosisModelField[] = [];
  const text = (field: "expected" | "observed" | "changed"): string | undefined => {
    const value = boundedText(reported[field], field, refusals);
    if (value !== undefined) modelFields.push(field);
    return value;
  };
  const expected = text("expected");
  const observed = text("observed");
  const changed = text("changed");
  const achievable = reportedAchievability(reported.stillAchievable, "stillAchievable", refusals);
  // Core's `no` is a control, not an opinion: a person must act, and the model
  // saying otherwise does not make it so.
  const achievableRefused = achievable !== undefined && deterministic.stillAchievable === "no" && achievable !== "no";
  if (achievableRefused) refusals.push(`stillAchievable: the model reported "${achievable}" for a failure Core classified as needing a person, so Core's "no" stands.`);
  if (achievable !== undefined && !achievableRefused) modelFields.push("stillAchievable");
  const deterministicPossible = reportedAchievability(reported.deterministicRecoveryPossible, "deterministicRecoveryPossible", refusals);
  if (deterministicPossible !== undefined && !deterministic.deterministicRecoveryAvailable) modelFields.push("deterministicRecoveryPossible");
  const explorationNeeded = reportedBoolean(reported.explorationNeeded, "explorationNeeded", refusals);
  if (explorationNeeded !== undefined) modelFields.push("explorationNeeded");
  const patchNeeded = reportedBoolean(reported.patchNeeded, "patchNeeded", refusals);
  if (patchNeeded !== undefined) modelFields.push("patchNeeded");
  const confidence = boundedConfidence(response.confidence);
  return {
    ...base,
    source: "model",
    ...(expected !== undefined ? { expected } : {}),
    ...(observed !== undefined ? { observed } : {}),
    ...(changed !== undefined ? { changed } : {}),
    stillAchievable: achievableRefused || achievable === undefined ? base.stillAchievable : achievable,
    deterministicRecoveryPossible: deterministic.deterministicRecoveryAvailable
      ? "yes"
      : deterministicPossible ?? base.deterministicRecoveryPossible,
    explorationNeeded: explorationNeeded ?? base.explorationNeeded,
    patchNeeded: patchNeeded ?? base.patchNeeded,
    ...(confidence !== undefined ? { confidence } : {}),
    modelFields,
    refusals
  };
}

/**
 * The record written onto the run: every verdict, and none of the prose. The
 * three description fields become a count, so a reader can tell that the model
 * described the failure without the description being stored.
 */
export function summarizeAutomationStudioRuntimeStructuredDiagnosis(
  diagnosis: AutomationStudioRuntimeStructuredDiagnosis
): AutomationStudioStructuredDiagnosisSummary {
  const { expected, observed, changed, ...rest } = diagnosis;
  return {
    ...rest,
    describedFieldCount: [expected, observed, changed].filter((value) => value !== undefined).length
  };
}

/**
 * Whether Core's own classification already asks for a change to the Flow.
 *
 * A candidate kind names the shape of the repair, so it answers this directly:
 * `diagnosis_only` and `instruction_suggestion` are the two that ask for no
 * patch at all. This is what closes L5's second clause without a model — the
 * patch call used to fire for these too.
 */
function deterministicPatchNeeded(diagnosis: AutomationStudioRuntimeDeterministicDiagnosis): boolean {
  return diagnosis.candidateKind !== "diagnosis_only" && diagnosis.candidateKind !== "instruction_suggestion";
}

function boundedText(value: JsonValue | undefined, field: string, refusals: string[]): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") {
    refusals.push(`${field}: expected a string and the model sent ${Array.isArray(value) ? "an array" : typeof value}.`);
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (trimmed.length > AUTOMATION_STUDIO_STRUCTURED_DIAGNOSIS_TEXT_MAX_LENGTH) {
    refusals.push(`${field}: ${trimmed.length} characters is past the ${AUTOMATION_STUDIO_STRUCTURED_DIAGNOSIS_TEXT_MAX_LENGTH}-character bound.`);
    return undefined;
  }
  return trimmed;
}

function reportedAchievability(value: JsonValue | undefined, field: string, refusals: string[]): AutomationStudioRuntimeDiagnosisAchievability | undefined {
  if (value === undefined || value === null) return undefined;
  if (value === "yes" || value === "no" || value === "unknown") return value;
  refusals.push(`${field}: expected yes, no or unknown and the model sent ${JSON.stringify(value).slice(0, 64)}.`);
  return undefined;
}

function reportedBoolean(value: JsonValue | undefined, field: string, refusals: string[]): boolean | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "boolean") return value;
  refusals.push(`${field}: expected a boolean and the model sent ${JSON.stringify(value).slice(0, 64)}.`);
  return undefined;
}

function boundedConfidence(value: number | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : undefined;
}

function isRecord(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
