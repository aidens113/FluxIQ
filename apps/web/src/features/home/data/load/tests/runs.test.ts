import { describe, expect, it } from "vitest";
import type { ProgramCommandTransport } from "../../../../automation-studio/data/program-transport";
import { loadRuns } from "../runs";

const signal = new AbortController().signal;

function transport(answers: Record<string, (payload?: Record<string, unknown>) => { ok: boolean; payload?: unknown }>): ProgramCommandTransport {
  const answer = (endpoint: string, payload?: Record<string, unknown>) => Promise.resolve((answers[endpoint] ?? (() => ({ ok: false })))(payload));
  return { get: (endpoint: string) => answer(endpoint), post: (endpoint: string, payload: Record<string, unknown>) => answer(endpoint, payload) } as ProgramCommandTransport;
}

describe("loadRuns", () => {
  it("joins every project's runs with its Flow names", async () => {
    const studio = transport({
      projects: () => ({ ok: true, payload: { projects: [{ id: "p1" }, { id: "p2" }] } }),
      "list-flow-runs": (payload) => ({ ok: true, payload: { runs: [{ runId: `r-${String(payload?.projectId)}`, flowId: "f1", startedAt: 1 }] } }),
      "list-flow-summaries": () => ({ ok: true, payload: { flows: [{ flowId: "f1", name: "Cheapest listings" }] } })
    });
    const result = await loadRuns(studio, signal);
    expect(result.runs.map((run) => [run.runId, run.flowName])).toEqual([["r-p1", "Cheapest listings"], ["r-p2", "Cheapest listings"]]);
    expect(result.incomplete).toBe(false);
  });
  it("marks the answer incomplete when one project cannot be read, and fails when none can", async () => {
    const partial = transport({
      projects: () => ({ ok: true, payload: { projects: [{ id: "p1" }, { id: "p2" }] } }),
      "list-flow-runs": (payload) => (payload?.projectId === "p1" ? { ok: true, payload: { runs: [] } } : { ok: false })
    });
    expect((await loadRuns(partial, signal)).incomplete).toBe(true);
    const none = transport({
      projects: () => ({ ok: true, payload: { projects: [{ id: "p1" }] } }),
      "list-flow-runs": () => ({ ok: false })
    });
    await expect(loadRuns(none, signal)).rejects.toThrow();
    await expect(loadRuns(transport({}), signal)).rejects.toThrow();
  });
  it("has no runs, and no error, when the person has no projects", async () => {
    const empty = transport({ projects: () => ({ ok: true, payload: { projects: [] } }) });
    expect(await loadRuns(empty, signal)).toEqual({ runs: [], flowNames: new Map(), incomplete: false });
  });
});
