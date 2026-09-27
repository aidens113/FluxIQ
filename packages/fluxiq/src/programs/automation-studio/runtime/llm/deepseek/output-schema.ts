import {
  AUTOMATION_STUDIO_LLM_DIAGNOSIS_TEXT_MAX_LENGTH,
  automationStudioRuntimePatchOutputSchema,
  automationStudioLlmTaskExpectsDiagnosis,
  type AutomationStudioLlmTaskRequest
} from "../harness.ts";
import { AUTOMATION_STUDIO_FLOW_BOOTSTRAP_OUTPUT_SCHEMA } from "../../flow-bootstrap/index.ts";

/** The longest summary an evidence decision may answer with. */
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
    summary: { type: "string", minLength: 1, maxLength: 20_000 },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    diagnosis: DIAGNOSIS_FIELDS_SCHEMA,
    metadata: JSON_METADATA_SCHEMA
  }
} as const;

/** The shape a task's answer must satisfy, or `undefined` where the task declares none. */
export function automationStudioDeepSeekOutputSchema(request: AutomationStudioLlmTaskRequest): Record<string, unknown> | undefined {
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
  if (request.taskKind !== "runtime_patch") return request.taskKind === "flow_bootstrap" ? AUTOMATION_STUDIO_FLOW_BOOTSTRAP_OUTPUT_SCHEMA : undefined;
  // Two shapes, always: a patch, or the answer that there is no repair (`harness/runtime-patch-schema.ts`).
  return automationStudioRuntimePatchOutputSchema({ proposalOnly: request.metadata?.executionPurpose === "diagnose_and_adapt" });
}

/** The answer a task kind declares, which the request must agree with. */
export function automationStudioDeepSeekExpectedOutput(kind: AutomationStudioLlmTaskRequest["taskKind"]): AutomationStudioLlmTaskRequest["expectedOutput"] {
  if (kind === "flow_bootstrap") return "flow_bootstrap";
  if (kind === "evidence_tool_decision") return "evidence_tool_decision";
  if (automationStudioLlmTaskExpectsDiagnosis(kind)) return "diagnosis";
  if (kind === "runtime_patch") return "runtime_patch";
  if (kind === "instruction_suggestion") return "instruction_suggestion";
  return "change_proposal";
}
