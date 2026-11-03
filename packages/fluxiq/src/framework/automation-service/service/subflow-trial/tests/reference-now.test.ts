import { describe, expect, it } from "vitest";
import { runAutomationStudioSubflowTrial } from "../index.ts";
import { subflowTrialFixture } from "./fixtures.ts";

describe("a subflow trial's persisted date reference", () => {
  it("passes one session start through predecessor and target executions after midnight", async () => {
    const f = subflowTrialFixture();
    const startedAt = Date.UTC(2026, 9, 30, 23, 59, 59);
    const references: Array<number | undefined> = [];
    f.ports.now = () => startedAt;
    f.ports.graphOptions = ({ signal }) => ({
      signal, now: () => startedAt + 2_000,
      nativeNodeExecutor: async ({ hostContext }) => {
        references.push(hostContext?.referenceNow);
        return { result: { status: "success", route: "success", outputs: {} } };
      }
    });
    const result = await runAutomationStudioSubflowTrial(f.request(), f.ports);
    expect(result.record.execution).toBe("succeeded");
    expect(f.sessions.at(-1)?.startedAt).toBe(startedAt);
    expect(references).toEqual([startedAt, startedAt]);
    expect(f.sessions.at(-1)?.trace?.referenceNow).toBe(startedAt);
  });
});
