import { describe, expect, it, vi } from "vitest";
import type { AutomationStudioAnswerFirstAttemptRun } from "../../../state.ts";
import { automationStudioAnswerFirstFlowStage } from "../../../flow-stage.ts";

function fixture(readInput: unknown) {
  const start = vi.fn();
  const memory = { get: vi.fn() };
  const run = { route: { kind: "use", saved: { steps: [{ id: "lasting", input: { node: "fixture.act", consequences: ["modify_existing"] } }, { id: "later", routing: { kind: "on_failed", after: "lasting" }, input: readInput }], stepsDigest: "saved" } }, input: { caller: { inputs: {} } }, memory, path: "run_flow", liveSteps: 0 } as unknown as AutomationStudioAnswerFirstAttemptRun;
  return { run, start, memory };
}

describe("saved automatic processing preflight", () => {
  it("checks a later routed read before any earlier lasting step is started", async () => {
    const test = fixture({ parameters: { recordOutput: { schema: { schemaVersion: "0.1", fields: [{ id: "date", label: "Date", valueType: "string" }] }, process: { where: [{ field: "date", atMost: { $state: { path: "latest", fallback: "2030-01-02" } }, as: "date" }], declaration: { version: 1, source: "a".repeat(64), revision: 1, bindings: { date: "date" } } } } } });
    expect(await automationStudioAnswerFirstFlowStage(test.run, test.start)).toBeUndefined();
    expect(test.start).not.toHaveBeenCalled();
    expect(test.memory.get).not.toHaveBeenCalled();
    expect(test.run.flowRun).toEqual({ outcome: { kind: "not_assembled", codes: ["answer_first.processing_inputs_unavailable"] }, wentOut: false });
    expect(test.run.path).toBe("explore");
  });
  it("contains malformed saved input within the existing never-throw boundary", async () => {
    const test = fixture(undefined);
    await expect(automationStudioAnswerFirstFlowStage(test.run, test.start)).resolves.toBeUndefined();
    expect(test.start).not.toHaveBeenCalled();
    expect(test.run.path).toBe("explore");
  });
});
