// A run request's humanness: refused unless a whole number from 0 to 100,
// and handed to the run it starts; absent, the run's input is what it was.

import { describe, expect, it } from "vitest";
import { runRuntimeSessionForRequest } from "../run-session.ts";

type Service = Parameters<typeof runRuntimeSessionForRequest>[0];

function harness() {
  const inputs: Array<Record<string, unknown>> = [];
  const service = {
    conversations: {} as Service["conversations"],
    getFlowRunDetail: async () => null,
    runRuntimeSession: async (input: Record<string, unknown>) => {
      inputs.push(input);
      return { runId: "run", status: "succeeded" };
    }
  };
  const run = (payload: Record<string, unknown>) => runRuntimeSessionForRequest(service as unknown as Service, { payload });
  return { run, inputs };
}

describe("a run request's humanness", () => {
  it.each([0, 25, 100])("accepts %s and reaches the run's input", async (humanness) => {
    const h = harness();
    const answer = await h.run({ projectId: "p", flowId: "f", humanness });
    expect(answer.ok).toBe(true);
    expect(h.inputs[0]).toMatchObject({ humanness });
  });

  it.each([101, -1, 1.5, "x", null])("refuses %s before any run starts", async (humanness) => {
    const h = harness();
    expect(await h.run({ projectId: "p", flowId: "f", humanness })).toMatchObject({ ok: false, error: expect.stringContaining("humanness") });
    expect(h.inputs).toEqual([]);
  });

  it("starts the run exactly as before when the request has none", async () => {
    const h = harness();
    await h.run({ projectId: "p", flowId: "f" });
    expect(h.inputs[0]).toEqual({ projectId: "p", flowId: "f" });
    expect(h.inputs[0]).not.toHaveProperty("humanness");
  });
});
