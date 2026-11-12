import { describe, expect, it } from "vitest";
import type { ProgramCommandTransport } from "../../../automation-studio/data/program-transport";
import { loadDatasetRows } from "../load-dataset-rows";

const signal = new AbortController().signal;

function transport(answers: Record<string, (payload?: Record<string, unknown>) => { ok: boolean; payload?: unknown }>): ProgramCommandTransport {
  const answer = (endpoint: string, payload?: Record<string, unknown>) => Promise.resolve((answers[endpoint] ?? (() => ({ ok: false })))(payload));
  return { get: (endpoint: string) => answer(endpoint), post: (endpoint: string, payload: Record<string, unknown>) => answer(endpoint, payload) } as ProgramCommandTransport;
}

const table = (projectId: string, extra: Record<string, unknown> = {}) => ({ flowId: "f1", datasetId: `d-${projectId}`, label: "Listings", latestRunId: `r-${projectId}`, latestUpdatedAt: 5, runCount: 2, latestRecordCount: 12, latestTruncated: false, ...extra });

describe("loadDatasetRows", () => {
  it("joins every project's tables with Flow names", async () => {
    const studio = transport({
      projects: () => ({ ok: true, payload: { projects: [{ id: "p1" }, { id: "p2" }] } }),
      "list-project-datasets": (payload) => ({ ok: true, payload: { datasets: [table(String(payload?.projectId)), { datasetId: "no-run" }], page: { nextCursor: null } } }),
      "list-flow-summaries": () => ({ ok: true, payload: { flows: [{ flowId: "f1", name: "Cheapest listings" }] } })
    });
    const result = await loadDatasetRows(studio, signal);
    expect(result.rows.map((row) => [row.projectId, row.runId, row.flowName, row.name, row.rowCount])).toEqual([["p1", "r-p1", "Cheapest listings", "Listings", 12], ["p2", "r-p2", "Cheapest listings", "Listings", 12]]);
    expect(result.incomplete).toBe(false);
  });
  it("follows the cursor to the next page and stops on a repeated one", async () => {
    const cursors: unknown[] = [];
    const studio = transport({
      projects: () => ({ ok: true, payload: { projects: [{ id: "p1" }] } }),
      "list-project-datasets": (payload) => {
        cursors.push(payload?.cursor);
        return payload?.cursor
          ? { ok: true, payload: { datasets: [table("p1", { datasetId: "second" })], page: { nextCursor: "c1" } } }
          : { ok: true, payload: { datasets: [table("p1")], page: { nextCursor: "c1" } } };
      }
    });
    const result = await loadDatasetRows(studio, signal);
    expect(result.rows.map((row) => row.datasetId)).toEqual(["d-p1", "second"]);
    expect(cursors).toEqual([undefined, "c1"]);
  });
  it("marks the answer incomplete when one project cannot be read, and fails when none can", async () => {
    const partial = transport({
      projects: () => ({ ok: true, payload: { projects: [{ id: "p1" }, { id: "p2" }] } }),
      "list-project-datasets": (payload) => (payload?.projectId === "p1" ? { ok: true, payload: { datasets: [] } } : { ok: false })
    });
    expect((await loadDatasetRows(partial, signal)).incomplete).toBe(true);
    const none = transport({
      projects: () => ({ ok: true, payload: { projects: [{ id: "p1" }] } }),
      "list-project-datasets": () => ({ ok: false })
    });
    await expect(loadDatasetRows(none, signal)).rejects.toThrow();
    await expect(loadDatasetRows(transport({}), signal)).rejects.toThrow();
  });
});
