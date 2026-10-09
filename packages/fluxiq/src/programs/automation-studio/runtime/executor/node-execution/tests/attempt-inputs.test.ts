import { describe, expect, it } from "vitest";
import type { JsonValue } from "../../../../../../core/index.ts";
import type { AutomationStudioNodeAttemptTrace } from "../../contracts.ts";
import { automationStudioAttemptInputs } from "../index.ts";

function attempt(attemptId: string, inputs: Record<string, JsonValue>, rest: Partial<AutomationStudioNodeAttemptTrace> = {}): AutomationStudioNodeAttemptTrace {
  return { attemptId, nodeId: attemptId.split(".attempt.")[0]!, definitionId: "builtin.policy.action", startedAt: 1, status: "succeeded", inputs, outputs: {}, effects: [], ...rest };
}

describe("an attempt's inputs read back whole", () => {
  it("hands back an attempt's own inputs when it keeps them whole", () => {
    const whole = attempt("a.attempt.1", { query: "q" });
    expect(automationStudioAttemptInputs([whole], 0)).toEqual({ query: "q" });
  });

  it("walks back through every attempt kept as a change, in order", () => {
    const attempts = [
      attempt("a.attempt.1", { query: "q" }, { outputs: { page: { url: "one" } } }),
      attempt("b.attempt.2", { added: 1 }, { inputsSince: { attemptId: "a.attempt.1", shared: [{ input: "page", attemptId: "a.attempt.1", output: "page" }] }, outputs: { page: { url: "two" } } }),
      attempt("c.attempt.3", { added: 2 }, { inputsSince: { attemptId: "b.attempt.2", shared: [{ input: "page", attemptId: "b.attempt.2", output: "page" }], removed: ["query"] } })
    ];

    expect(automationStudioAttemptInputs(attempts, 1)).toEqual({ query: "q", page: { url: "one" }, added: 1 });
    expect(automationStudioAttemptInputs(attempts, 2)).toEqual({ page: { url: "two" }, added: 2 });
  });

  it("leaves out what an attempt missing from the list kept, rather than guessing it", () => {
    const orphan = attempt("c.attempt.3", { added: 2 }, { inputsSince: { attemptId: "b.attempt.2", shared: [{ input: "page", attemptId: "a.attempt.1", output: "page" }] } });
    expect(automationStudioAttemptInputs([orphan], 0)).toEqual({ added: 2 });
  });

  it("answers an index the list does not have with nothing", () => {
    expect(automationStudioAttemptInputs([], 3)).toEqual({});
  });
});
