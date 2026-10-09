import { describe, expect, it } from "vitest";
import type { JsonValue } from "../../../../../../core/index.ts";
import type { AutomationStudioGraphExecutionTrace, AutomationStudioNodeAttemptTrace } from "../../contracts.ts";
import { automationStudioTraceWithSharedInputs, automationStudioWithWholeAttemptInputs } from "../index.ts";

function attempt(attemptId: string, inputs: Record<string, JsonValue>, outputs: Record<string, JsonValue> = {}): AutomationStudioNodeAttemptTrace {
  return { attemptId, nodeId: attemptId.split(".attempt.")[0]!, definitionId: "builtin.policy.action", startedAt: 1, status: "succeeded", inputs, outputs, effects: [] };
}

function trace(attempts: AutomationStudioNodeAttemptTrace[]): AutomationStudioGraphExecutionTrace {
  return { status: "succeeded", startedAt: 1, finishedAt: 2, attempts, values: {}, effects: [] };
}

const page = { url: "https://example.test/one" };
const executed = trace([attempt("a.attempt.1", { query: "q" }, { page }), attempt("b.attempt.2", { query: "q", "a.page": page, page })]);
const stored = JSON.parse(JSON.stringify(automationStudioTraceWithSharedInputs(executed, {}))) as AutomationStudioGraphExecutionTrace;

describe("an answer read whole", () => {
  it("gives every attempt of a saved trace its whole inputs and no inputsSince, wherever the trace sits", () => {
    expect(stored.attempts[1]?.inputsSince).toBeDefined();
    const child = { ...attempt("call.attempt.3", {}), childTrace: stored };
    const answer = automationStudioWithWholeAttemptInputs({ session: { trace: stored }, parent: trace([child]) });

    for (const read of [answer.session.trace, answer.parent.attempts[0]!.childTrace!]) {
      expect(read.attempts[1]).not.toHaveProperty("inputsSince");
      expect(read.attempts[1]!.inputs).toEqual({ query: "q", "a.page": page, page });
    }
    // The stored form is left as it was.
    expect(stored.attempts[1]?.inputsSince).toBeDefined();
  });

  it("hands back an answer with no saved trace in it as it came", () => {
    const plain = { session: { trace: executed }, rows: [{ attemptId: "not.a.trace" }], count: 2 };
    expect(automationStudioWithWholeAttemptInputs(plain)).toBe(plain);
    expect(automationStudioWithWholeAttemptInputs(null)).toBeNull();
  });
});
