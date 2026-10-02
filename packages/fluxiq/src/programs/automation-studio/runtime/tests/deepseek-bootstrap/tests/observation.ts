// What the stub DeepSeek endpoint (`harness.ts`) records of each decision call
// it is sent, and the readings it takes of the request: the evidence's issue
// codes, and the shown Flow draft measured against its budget.

export type DecisionObservation = {
  iteration: number;
  offeredDecisionKinds: string[];
  evidence: Array<{ toolId: string; issueCodes: string[] }>;
  completionFeedback: string[];
  draft: {
    present: boolean;
    bytes: number;
    budget: number;
    steps: number;
    unlisted: number;
    withoutInput: number;
    inputTooLarge: number;
    overBudget: boolean;
  };
  registeredRecordProducerCount: number;
  visibleRecordProducerCount: number;
  /** The entry a repair round opens with (`llm/evidence-loop/resume.ts`, `core.resumed`), when this decision was shown one. */
  resumed?: Record<string, unknown>;
};

export function issueCodesForEvidence(
  evidence: Array<{ toolId?: unknown; value?: unknown }>,
  toolId: string
): string[] {
  return evidence.flatMap((entry) => {
    if (entry.toolId !== toolId || !entry.value || typeof entry.value !== "object" || Array.isArray(entry.value)) return [];
    const value = entry.value as Record<string, unknown>;
    const issues = Array.isArray(value.issues) ? value.issues : [];
    const refused = Array.isArray(value.refused) ? value.refused : [];
    return [
      ...issues.flatMap((issue) =>
        issue && typeof issue === "object" && typeof (issue as Record<string, unknown>).code === "string"
          ? [(issue as Record<string, unknown>).code as string]
          : []
      ),
      ...refused.flatMap((item) =>
        item && typeof item === "object" && typeof (item as Record<string, unknown>).reason === "string"
          ? [(item as Record<string, unknown>).reason as string]
          : []
      )
    ];
  });
}

export const PACKED_DRAFT_FIELDS = [
  "step",
  "actionId",
  "input",
  "resultCode",
  "changed",
  "disposition",
  "inResult",
  "replayed",
  "runs",
  "settings"
] as const;

export function draftObservation(value: unknown, budget: number): DecisionObservation["draft"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { present: false, bytes: 0, budget, steps: 0, unlisted: 0, withoutInput: 0, inputTooLarge: 0, overBudget: false };
  }
  const draft = value as Record<string, unknown>;
  const steps = Array.isArray(draft.steps) ? draft.steps : [];
  const packed = draft.format === "step_rows_v1";
  const packedFieldsValid = packed
    && Array.isArray(draft.fields)
    && draft.fields.length === PACKED_DRAFT_FIELDS.length
    && draft.fields.every((field, index) => field === PACKED_DRAFT_FIELDS[index]);
  const withoutInput = steps.filter((step) => packed
    ? !packedFieldsValid
      || !Array.isArray(step)
      || step.length < 7
      || step.length > PACKED_DRAFT_FIELDS.length
      || step[2] === null
      || step[2] === undefined
    : !step
      || typeof step !== "object"
      || Array.isArray(step)
      || (!("input" in step) && (step as Record<string, unknown>).inputTooLarge !== true)
  ).length;
  const inputTooLarge = steps.filter((step) => !packed
    && step && typeof step === "object" && !Array.isArray(step) && (step as Record<string, unknown>).inputTooLarge === true
  ).length;
  const bytes = Buffer.byteLength(JSON.stringify(value), "utf8");
  return {
    present: true,
    bytes,
    budget,
    steps: steps.length,
    unlisted: typeof draft.unlisted === "number" ? draft.unlisted : 0,
    withoutInput,
    inputTooLarge,
    overBudget: bytes > budget
  };
}

export function feedbackRows(observation: DecisionObservation | undefined, toolId: string): Array<{ toolId: string; issueCodes: string[] }> {
  return observation?.evidence.filter((entry) => entry.toolId === toolId) ?? [];
}
