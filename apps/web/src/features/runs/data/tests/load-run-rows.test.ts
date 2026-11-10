import { describe, expect, it } from "vitest";
import type { ProgramCommandTransport } from "../../../automation-studio/data/program-transport";
import { loadRunRows } from "../load-run-rows";

const signal = new AbortController().signal;

function transport(answers: Record<string, (payload?: Record<string, unknown>) => { ok: boolean; payload?: unknown }>): ProgramCommandTransport {
  const answer = (endpoint: string, payload?: Record<string, unknown>) => Promise.resolve((answers[endpoint] ?? (() => ({ ok: false })))(payload));
  return { get: (endpoint: string) => answer(endpoint), post: (endpoint: string, payload: Record<string, unknown>) => answer(endpoint, payload) } as ProgramCommandTransport;
}

describe("loadRunRows", () => {
  it("joins every project's runs with Flow names and the metadata the run recorded", async () => {
    const studio = transport({
      projects: () => ({ ok: true, payload: { projects: [{ id: "p1" }, { id: "p2" }] } }),
      "list-flow-runs": (payload) => ({ ok: true, payload: { runs: [{ runId: `r-${String(payload?.projectId)}`, flowId: "f1", startedAt: 1, actionAttemptCount: 4, metadata: { client: "extension" } }] } }),
      "list-flow-summaries": () => ({ ok: true, payload: { flows: [{ flowId: "f1", name: "Cheapest listings" }] } })
    });
    const result = await loadRunRows(studio, signal);
    expect(result.rows.map((row) => [row.runId, row.flowName, row.steps, row.client])).toEqual([["r-p1", "Cheapest listings", 4, "extension"], ["r-p2", "Cheapest listings", 4, "extension"]]);
    expect(result.incomplete).toBe(false);
  });
  it("marks the answer incomplete when one project cannot be read, and fails when none can", async () => {
    const partial = transport({
      projects: () => ({ ok: true, payload: { projects: [{ id: "p1" }, { id: "p2" }] } }),
      "list-flow-runs": (payload) => (payload?.projectId === "p1" ? { ok: true, payload: { runs: [] } } : { ok: false })
    });
    expect((await loadRunRows(partial, signal)).incomplete).toBe(true);
    const none = transport({
      projects: () => ({ ok: true, payload: { projects: [{ id: "p1" }] } }),
      "list-flow-runs": () => ({ ok: false })
    });
    await expect(loadRunRows(none, signal)).rejects.toThrow();
  });
});
