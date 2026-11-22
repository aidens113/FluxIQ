/** Data readiness is separate from universal task success and from durable materialization. */
export type AutomationStudioAnswerFirstResultReadiness =
  | { state: "legacy" | "not-applicable" | "ready" }
  | { state: "missing-evidence"; code: string; reason: string };
