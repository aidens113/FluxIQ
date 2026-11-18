import { describe, expect, it } from "vitest";
import type { ProgramCommandTransport } from "../../../automation-studio/data/program-transport";
import { loadRunRows } from "../load-run-rows";

const signal = new AbortController().signal;

function transport(answers: Record<string, { ok: boolean; payload?: unknown }>): { studio: ProgramCommandTransport; calls: string[] } {
  const calls: string[] = [];
  const answer = (endpoint: string) => {
    calls.push(endpoint);
    return Promise.resolve(answers[endpoint] ?? { ok: false });
  };
  return { studio: { get: answer, post: answer } as unknown as ProgramCommandTransport, calls };
}

const runs = { ok: true, payload: { runs: [
  { runId: "r-p1", flowId: "f1", projectId: "p1", startedAt: 1, actionAttemptCount: 4, metadata: { client: "extension" } },
  { runId: "r-p2", flowId: "f2", projectId: "p2", startedAt: 2 }
] } };

describe("loadRunRows", () => {
  it("joins every project's runs with Flow names and the metadata the run recorded, in two requests", async () => {
    const { studio, calls } = transport({
      "list-recent-flow-runs": runs,
      "list-workspace-flow-summaries": { ok: true, payload: { flows: [{ flowId: "f1", name: "Cheapest listings" }, { flowId: "f2", name: "Prices" }] } }
    });
    const result = await loadRunRows(studio, signal);
    expect(result.rows.map((row) => [row.runId, row.projectId, row.flowName, row.steps, row.client])).toEqual([["r-p1", "p1", "Cheapest listings", 4, "extension"], ["r-p2", "p2", "Prices", undefined, undefined]]);
    expect(result.incomplete).toBe(false);
    expect([...calls].sort()).toEqual(["list-recent-flow-runs", "list-workspace-flow-summaries"]);
  });
  it("still lists the runs, marked incomplete, when the Flow names cannot be read", async () => {
    const { studio } = transport({ "list-recent-flow-runs": runs });
    const result = await loadRunRows(studio, signal);
    expect(result.rows).toHaveLength(2);
    expect(result.incomplete).toBe(true);
  });
  it("fails when the runs cannot be read", async () => {
    const { studio } = transport({ "list-workspace-flow-summaries": { ok: true, payload: { flows: [] } } });
    await expect(loadRunRows(studio, signal)).rejects.toThrow();
  });
});
