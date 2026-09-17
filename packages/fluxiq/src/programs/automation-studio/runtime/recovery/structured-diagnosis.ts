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
// **The model answers through one named channel, and only that one.** The
// fields below are read from `response.diagnosis`
// (`AutomationStudioLlmDiagnosisFields`): a fixed set of keys, each declared in
// the provider's response schema with `additionalProperties: false`, each
// checked by name in `parseAutomationStudioLlmProviderResult` before the
// response enters the process, and each carried through
// `stripAutomationStudioLlmResponseMetadata` because it was checked.
//
// `response.metadata` is not that channel and is never read here. It is an open
// field, so a value arriving in it was checked by nothing; the strip removes it
// from every response, and a diagnosis that reached this module only through it
// would be an unvalidated value wearing the name of a validated one. A metadata
// key that matches a field name is therefore refused rather than ignored -- the
// refusal is recorded, so the run says the answer was discarded instead of the
// answer quietly becoming a verdict. Note what this closes: `patchNeeded` is
// the one field that can stop the billed patch call, so the old route was a way
// to change what Core does with a value nothing validated.
//
// **What is recorded is still not what is carried.** The channel bounds each
// description to 500 characters; it does not make the prose storable. The
// summary written onto a run is verdicts and counts, as below.

import type { JsonObject, JsonValue } from "../../../../core/index.ts";
import type { AutomationStudioLlmDiagnosisFields, AutomationStudioLlmTaskResult } from "../llm/index.ts";
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
   * supplied through the diagnosis channel, and is empty when it supplied
   * nothing Core could use.
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
    explorationNeeded: deterministicExplorationNeeded(deterministic),
    patchNeeded: deterministicPatchNeeded(deterministic),
    modelFields: [],
    refusals: []
  };
  const response = input.result?.ok === true && input.result.response?.kind === "diagnosis" ? input.result.response : undefined;
  if (!response) return base;
  const reported: AutomationStudioLlmDiagnosisFields = response.diagnosis ?? {};
  const refusals: string[] = [];
  refuseDiagnosisFieldsSentAsMetadata(response.metadata, refusals);
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

/**
 * Core's own answer for `explorationNeeded` when the model does not give one.
 *
 * Omission is the EXPECTED case, not an error: the prompt tells the model to
 * "omit a field you cannot answer rather than guessing it", and whether looking
 * at the page would help is exactly the kind of thing it often cannot answer
 * before looking. This field used to fall back to a hard `false` while its
 * neighbour `patchNeeded` fell back to Core's classifier, and that asymmetry
 * ended recoveries silently: `plan.ts` reads `explorationRequested` straight
 * from here, so a model following its instructions stopped the loop.
 *
 * Measured 2026-09-17, thirteen live repair-lane runs against DeepSeek: every
 * one made a single diagnosis call, every one reported
 * `exploration.requested: false`, and not one attempted a repair -- one call
 * spent of the twenty-six granted. The lane's only genuine repair task failed;
 * the rest were refusals, which pass precisely because stopping after diagnosis
 * is the right answer for them, so the number looked healthy while the repair
 * capability was zero.
 *
 * So Core answers it: if Core's deterministic analysis already has a recovery
 * in hand there is nothing to go looking for, and otherwise looking is the only
 * way to learn anything. This deliberately does NOT consult `stillAchievable`.
 * Exploration is not only the patch's errand -- "let me look at the page first,
 * and then say there is nothing to repair" has to stay reachable, or a refusal
 * is one the model could never check before giving it (`plan.ts`, and
 * `reports/w2-model-context-audit.md`). The cost of looking is bounded by the
 * run's own cost, token and deadline guards, never by this flag.
 */
function deterministicExplorationNeeded(diagnosis: AutomationStudioRuntimeDeterministicDiagnosis): boolean {
  return !diagnosis.deterministicRecoveryAvailable;
}

/**
 * The old, unnamed route, refused out loud.
 *
 * `response.metadata` once carried these fields and this module once read them.
 * It is an open field: nothing at the boundary checks what is in it, and the
 * parser strips it from every response for exactly that reason. So a field
 * arriving here through `metadata` is not a diagnosis Core validated, and
 * treating it as one would let an unchecked `patchNeeded` decide whether the
 * billed patch call happens.
 *
 * It is refused rather than ignored because a silent drop and a field the model
 * never sent look identical on the run record. Only the field *names* are
 * recorded -- Core's own vocabulary -- never a value, which would be the
 * model's reading of a page this record does not store.
 */
function refuseDiagnosisFieldsSentAsMetadata(metadata: JsonObject | undefined, refusals: string[]): void {
  if (!isRecord(metadata)) return;
  const misrouted = AUTOMATION_STUDIO_STRUCTURED_DIAGNOSIS_MODEL_FIELDS.filter((field) => metadata[field] !== undefined);
  if (!misrouted.length) return;
  refusals.push(`metadata: ${misrouted.join(", ")} arrived in response.metadata, which is not the diagnosis channel and is checked by nothing, so ${misrouted.length === 1 ? "it was" : "they were"} not read.`);
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
