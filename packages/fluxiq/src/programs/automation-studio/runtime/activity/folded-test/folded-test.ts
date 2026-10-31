import { automationStudioActivityFoldedTestLine } from "./folded-test-line.ts";

/** The tool a folded test is shown as: the part's own test (`../wording/core-tool.ts`). */
const TEST_TOOL = "core.test_subflow";
const SUBMIT = /^core\.submit_[a-z_]+$/u;

const objectOf = (value: unknown): Record<string, unknown> | undefined => (value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined);

/**
 * The test a submission carried, shaped as the call and answer a
 * `core.test_subflow` would have had, with Core's line for it; nothing when the
 * result is not a submit's or carries no `tested`. The submit's own row is
 * untouched: this is a second row after it.
 */
export function automationStudioActivityFoldedTest(call: { callId: string; toolId: string }, result: unknown): { call: { callId: string; toolId: string; value: Record<string, never> }; result: unknown; line: string | undefined } | undefined {
  if (!SUBMIT.test(call.toolId)) return undefined;
  const answer = objectOf(result);
  if (answer?.kind !== "llm_evidence_tool_execution") return undefined;
  const evidence = objectOf(answer.evidence);
  const tested = objectOf(evidence?.tested);
  if (!tested) return undefined;
  const fromAStep = objectOf(evidence?.testedWith)?.from !== undefined || tested.fromStep !== undefined;
  const code = typeof tested.code === "string" ? tested.code : undefined;
  return {
    call: { callId: `${call.callId}:tested`, toolId: TEST_TOOL, value: {} },
    result: { kind: "llm_evidence_tool_execution", evidence: tested, ...(code ? { resultCode: code } : {}) },
    line: automationStudioActivityFoldedTestLine(fromAStep)
  };
}
