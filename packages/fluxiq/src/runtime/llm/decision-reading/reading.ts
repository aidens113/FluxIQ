// What reading a decision did to it, by Core's own names: never a word of the
// reply. The harness says each as a diagnostic in the step log
// (`../harness/provider-result.ts`); the provider adapter only checks the
// decision as read (`../anthropic/decision-check.ts`).

/** One reading applied to a decision. */
export type AutomationStudioLlmDecisionReading =
  | { code: "own_key_nulls"; keys: string[] }
  | { code: "flat_tool_call"; toolId: string; callIdFilled: boolean }
  | { code: "kind_inferred"; kindWritten: "absent" | "unknown" | "not_a_string"; callIdFilled: boolean }
  | { code: "value_tool_id"; toolId: string; key: string }
  | { code: "keys_folded"; toolId: string; movedKeys: string[] };
