import { AUTOMATION_STUDIO_LLM_DIAGNOSIS_TEXT_MAX_LENGTH } from "../harness/structured-response.ts";
import { automationStudioRuntimePatchOutputSchema } from "../harness/runtime-patch-schema.ts";
import { automationStudioLlmTaskExpectsDiagnosis } from "../harness/task-kind.ts";
import type { AutomationStudioLlmTaskRequest } from "../harness/index.ts";
import { automationStudioFlowBootstrapOutputSchema } from "../../flow-authoring/bootstrap/plan/index.ts";
import { automationStudioFlowBootstrapSizeLimitsOfContext } from "../../flow-authoring/bootstrap/plan/index.ts";
import { AUTOMATION_STUDIO_LLM_VERIFICATION_DEFECTS_SCHEMA } from "../verification-defects/index.ts";
import { AUTOMATION_STUDIO_LLM_FLOW_LESS_JUDGE_SOURCE, AUTOMATION_STUDIO_LLM_VERIFICATION_ANSWER_RECORDS_SCHEMA, AUTOMATION_STUDIO_LLM_VERIFICATION_CHECKED_SCHEMA, AUTOMATION_STUDIO_LLM_VERIFICATION_REPLY_REQUIRED, automationStudioLlmVerificationDiagnosisRequired } from "../verification-checked/index.ts";

/** The length an evidence decision's summary is asked to keep to, as a line a person reads: told, never held to. The reply is read whole and the chat shortens what it shows (`../../activity/text/reason-text.ts`). */
export const AUTOMATION_STUDIO_EVIDENCE_DECISION_MAX_SUMMARY_LENGTH = 240;

const JSON_METADATA_SCHEMA = { type: "object" } as const;
// The named channel a model answers a diagnosis through, as a schema. Every key
// is declared and `additionalProperties: false` closes the rest, which is the
// schema half of the rule `validateUnknownDiagnosisFields` enforces on the way
// back: a description Core can bound, a verdict from three words, a flag. There
// is deliberately no field here a model could write free-form structure into --
// `metadata` is that field, and it is stripped.
const DIAGNOSIS_FIELDS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    expected: { type: "string", minLength: 1, maxLength: AUTOMATION_STUDIO_LLM_DIAGNOSIS_TEXT_MAX_LENGTH },
    observed: { type: "string", minLength: 1, maxLength: AUTOMATION_STUDIO_LLM_DIAGNOSIS_TEXT_MAX_LENGTH },
    changed: { type: "string", minLength: 1, maxLength: AUTOMATION_STUDIO_LLM_DIAGNOSIS_TEXT_MAX_LENGTH },
    stillAchievable: { enum: ["yes", "no", "unknown"] },
    deterministicRecoveryPossible: { enum: ["yes", "no", "unknown"] },
    answersRequest: { enum: ["yes", "no", "unknown"] },
    explorationNeeded: { type: "boolean" },
    patchNeeded: { type: "boolean" }
  }
} as const;
const DIAGNOSIS_OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["kind", "summary"],
  properties: {
    kind: { const: "diagnosis" },
    summary: { type: "string", minLength: 1 },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    diagnosis: DIAGNOSIS_FIELDS_SCHEMA,
    metadata: JSON_METADATA_SCHEMA
  }
} as const;
// A result verification's answer, the verdict first (t653). The same members,
// ordered so the model writes `kind` and the closed `diagnosis` -- the verdict
// is its `answersRequest` -- before it narrates in `summary`. Live run
// `run-mva6mlo8-f519063c`: four of 21 judge replies wrote `summary` first,
// repeated one sentence in it until the provider's output ceiling cut them
// off, and left no verdict at all. Written first, the verdict survives such a
// cut, and the reply envelope reads it (`./verdict-before-cut.ts`). No limit
// changes: this orders what the model writes and caps nothing.
//
// Its diagnosis alone also offers `defects` (t752, `../verification-defects/`),
// right after the verdict: each defect of the result a no rests on, so Core can
// find it in its own record rather than read it out of prose. No other
// diagnosis is offered it.
// `checked` optionally cites stored cells; Core verifies the citations before a yes stands.
// `answerRecords` optionally says whether the request asks for records and how many the site shows as its answer (t875);
// the judge of an attempt with no Flow is held to it against the rows held (`../../result-verification/cited-yes/records-yes.ts`).
// What each reply requires is one table (`../verification-checked/reply-required.ts`, t875): the Flow-less judge's schema
// also requires `checked` and `answerRecords`, so a native grammar never lets an honest yes leave out what it is asked again for.
const { explorationNeeded, patchNeeded, ...JUDGED_FIELDS } = DIAGNOSIS_FIELDS_SCHEMA.properties;
function verificationOutputSchema(flowLess: boolean) {
  return {
    type: "object",
    additionalProperties: false,
    required: [...AUTOMATION_STUDIO_LLM_VERIFICATION_REPLY_REQUIRED],
    properties: {
      kind: DIAGNOSIS_OUTPUT_SCHEMA.properties.kind,
      diagnosis: {
        ...DIAGNOSIS_FIELDS_SCHEMA,
        required: automationStudioLlmVerificationDiagnosisRequired(flowLess),
        properties: { ...JUDGED_FIELDS, defects: AUTOMATION_STUDIO_LLM_VERIFICATION_DEFECTS_SCHEMA, checked: AUTOMATION_STUDIO_LLM_VERIFICATION_CHECKED_SCHEMA, answerRecords: AUTOMATION_STUDIO_LLM_VERIFICATION_ANSWER_RECORDS_SCHEMA, explorationNeeded, patchNeeded }
      },
      confidence: DIAGNOSIS_OUTPUT_SCHEMA.properties.confidence,
      summary: DIAGNOSIS_OUTPUT_SCHEMA.properties.summary,
      metadata: JSON_METADATA_SCHEMA
    }
  } as const;
}
const VERIFICATION_OUTPUT_SCHEMA = verificationOutputSchema(false);
const FLOW_LESS_VERIFICATION_OUTPUT_SCHEMA = verificationOutputSchema(true);

/** The shape a task's answer must satisfy, or `undefined` where the task declares none. */
export function automationStudioLlmTaskOutputSchema(request: AutomationStudioLlmTaskRequest): Record<string, unknown> | undefined {
  if (request.taskKind === "loop_verification") return request.metadata?.source === AUTOMATION_STUDIO_LLM_FLOW_LESS_JUDGE_SOURCE ? FLOW_LESS_VERIFICATION_OUTPUT_SCHEMA : VERIFICATION_OUTPUT_SCHEMA;
  if (automationStudioLlmTaskExpectsDiagnosis(request.taskKind)) return DIAGNOSIS_OUTPUT_SCHEMA;
  if (request.taskKind === "evidence_tool_decision" && request.context.evidenceLoop) return {
    type: "object",
    additionalProperties: false,
    required: ["kind", "summary", "decision"],
    properties: {
      kind: { const: "evidence_tool_decision" },
      summary: { type: "string", minLength: 1, maxLength: AUTOMATION_STUDIO_EVIDENCE_DECISION_MAX_SUMMARY_LENGTH },
      decision: request.context.evidenceLoop.decisionSchema
    }
  };
  if (request.taskKind !== "runtime_patch") return request.taskKind === "flow_bootstrap" ? automationStudioFlowBootstrapOutputSchema(automationStudioFlowBootstrapSizeLimitsOfContext(request.context.flowBootstrap)) : undefined;
  // Two shapes, always: a patch, or the answer that there is no repair (`harness/runtime-patch-schema.ts`).
  // The patch offers only the kinds the recovery plan allows, when the request declares them.
  return automationStudioRuntimePatchOutputSchema({ proposalOnly: request.metadata?.executionPurpose === "diagnose_and_adapt", allowedKinds: declaredAllowedPatchKinds(request.metadata?.allowedPatchKinds) });
}

/** The plan's allowed patch kinds as the request declared them, or undefined when it declared none. */
function declaredAllowedPatchKinds(value: unknown): string[] | undefined {
  return Array.isArray(value) ? value.filter((kind): kind is string => typeof kind === "string") : undefined;
}

/** The answer a task kind declares, which the request must agree with. */
export function automationStudioLlmTaskExpectedOutput(kind: AutomationStudioLlmTaskRequest["taskKind"]): AutomationStudioLlmTaskRequest["expectedOutput"] {
  if (kind === "flow_bootstrap") return "flow_bootstrap";
  if (kind === "evidence_tool_decision") return "evidence_tool_decision";
  if (automationStudioLlmTaskExpectsDiagnosis(kind)) return "diagnosis";
  if (kind === "runtime_patch") return "runtime_patch";
  if (kind === "instruction_suggestion") return "instruction_suggestion";
  return "change_proposal";
}
