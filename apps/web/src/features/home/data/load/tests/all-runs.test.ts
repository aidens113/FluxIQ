import { describe, expect, it } from "vitest";
import type { ProgramCommandTransport } from "../../../../automation-studio/data/program-transport";
import { loadAllRuns } from "../all-runs";

const signal = new AbortController().signal;

function transport(answers: Record<string, { ok: boolean; payload?: unknown }>) {
  const calls: string[] = [];
  const post = (endpoint: string) => {
    calls.push(endpoint);
    return Promise.resolve(answers[endpoint] ?? { ok: false });
  };
  return { studio: { get: post, post } as unknown as ProgramCommandTransport, calls };
}

describe("loadAllRuns", () => {
  it("asks two requests whatever the project count, and names each run's Flow", async () => {
    const { studio, calls } = transport({
      "list-recent-flow-runs": { ok: true, payload: { runs: [{ runId: "r1", flowId: "f1", projectId: "p1", startedAt: 1 }, { runId: "r2", flowId: "f2", projectId: "p2", startedAt: 2 }] } },
      "list-workspace-flow-summaries": { ok: true, payload: { flows: [{ flowId: "f1", name: "One", projectId: "p1" }, { flowId: "f2", name: "Two", projectId: "p2" }] } }
    });
    const result = await loadAllRuns(studio, signal);
    expect(calls.sort()).toEqual(["list-recent-flow-runs", "list-workspace-flow-summaries"]);
    expect(result.runs.map((run) => [run.runId, run.projectId, run.flowName])).toEqual([["r1", "p1", "One"], ["r2", "p2", "Two"]]);
    expect(result.incomplete).toBe(false);
  });
  it("keeps the runs under a general name, marked incomplete, when the Flow names fail", async () => {
    const { studio } = transport({ "list-recent-flow-runs": { ok: true, payload: { runs: [{ runId: "r1", flowId: "f1", startedAt: 1 }] } } });
    const result = await loadAllRuns(studio, signal);
    expect(result.runs[0]?.flowName).toBe("A Flow");
    expect(result.incomplete).toBe(true);
  });
  it("fails when the runs cannot be read", async () => {
    await expect(loadAllRuns(transport({}).studio, signal)).rejects.toThrow();
  });
});
