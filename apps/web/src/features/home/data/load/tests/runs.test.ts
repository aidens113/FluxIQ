import { describe, expect, it } from "vitest";
import type { ProgramCommandTransport } from "../../../../automation-studio/data/program-transport";
import { loadRuns } from "../runs";

const signal = new AbortController().signal;

function transport(answers: Record<string, (payload?: Record<string, unknown>) => { ok: boolean; payload?: unknown }>) {
  const calls: string[] = [];
  const answer = (endpoint: string, payload?: Record<string, unknown>) => {
    calls.push(endpoint);
    return Promise.resolve((answers[endpoint] ?? (() => ({ ok: false })))(payload));
  };
  const studio = { get: (endpoint: string) => answer(endpoint), post: (endpoint: string, payload: Record<string, unknown>) => answer(endpoint, payload) } as ProgramCommandTransport;
  return { studio, calls };
}

describe("loadRuns", () => {
  it("joins every given project's runs with its Flow names, never asking for the project list", async () => {
    const { studio, calls } = transport({
      "list-flow-runs": (payload) => ({ ok: true, payload: { runs: [{ runId: `r-${String(payload?.projectId)}`, flowId: "f1", startedAt: 1 }] } }),
      "list-flow-summaries": () => ({ ok: true, payload: { flows: [{ flowId: "f1", name: "Cheapest listings" }] } })
    });
    const result = await loadRuns(studio, ["p1", "p2"], signal);
    expect(result.runs.map((run) => [run.runId, run.flowName])).toEqual([["r-p1", "Cheapest listings"], ["r-p2", "Cheapest listings"]]);
    expect(result.incomplete).toBe(false);
    expect(calls).not.toContain("projects");
    expect(calls).toHaveLength(4);
  });
  it("costs two requests for the one project in view", async () => {
    const { studio, calls } = transport({ "list-flow-runs": () => ({ ok: true, payload: { runs: [] } }) });
    await loadRuns(studio, ["p1"], signal);
    expect(calls).toHaveLength(2);
  });
  it("marks the answer incomplete when one project cannot be read, and fails when none can", async () => {
    const partial = transport({ "list-flow-runs": (payload) => (payload?.projectId === "p1" ? { ok: true, payload: { runs: [] } } : { ok: false }) });
    expect((await loadRuns(partial.studio, ["p1", "p2"], signal)).incomplete).toBe(true);
    const none = transport({ "list-flow-runs": () => ({ ok: false }) });
    await expect(loadRuns(none.studio, ["p1"], signal)).rejects.toThrow();
  });
  it("has no runs, and no error, when the person has no projects", async () => {
    expect(await loadRuns(transport({}).studio, [], signal)).toEqual({ runs: [], flowNames: new Map(), incomplete: false });
  });
});
