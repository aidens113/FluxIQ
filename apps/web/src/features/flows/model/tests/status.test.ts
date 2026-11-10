import { describe, expect, it } from "vitest";
import type { RevisionEntry, RunSummary } from "../../wire";
import { historyRows, listedFlows, statusLine } from "..";

const NOW = 1_000_000_000;
const MINUTE = 60_000;
const run = (extra: Partial<RunSummary> = {}): RunSummary => ({ runId: "r1", flowId: "f1", status: "succeeded", startedAt: NOW - 2 * MINUTE, ...extra });

describe("statusLine", () => {
  it("reads the last whole run with its cost and the version", () => {
    expect(statusLine({ lastRun: run({ costUsd: 0 }), revision: 14, savedAt: NOW - 10 * MINUTE, now: NOW }))
      .toEqual({ tone: "ok", text: "Last whole run passed 2 min ago · $0.00 · version 14" });
  });

  it("says the Flow changed once it was saved after its last run began", () => {
    expect(statusLine({ lastRun: run(), revision: 15, savedAt: NOW - MINUTE, now: NOW }))
      .toEqual({ tone: "warn", text: "Changed, not yet run whole · version 15" });
  });

  it("says when it never ran, is running, failed, or cost under a cent", () => {
    expect(statusLine({ revision: 1, now: NOW }).text).toBe("Not run yet · version 1");
    expect(statusLine({ lastRun: run({ status: "running" }), revision: 3, now: NOW }).text).toBe("Running now · version 3");
    expect(statusLine({ lastRun: run({ status: "failed", costUsd: 0.004 }), revision: 3, now: NOW }))
      .toEqual({ tone: "bad", text: "Last whole run failed 2 min ago · under $0.01 · version 3" });
  });
});

describe("historyRows", () => {
  const entries: RevisionEntry[] = [
    { revisionNumber: 1, madeByLabel: "FluxIQ", message: "First saved version", createdAt: NOW - 60 * MINUTE, snapshotSha256: "aaa" },
    { revisionNumber: 3, madeByLabel: "The assistant", message: "", createdAt: NOW - MINUTE, snapshotSha256: null },
    { revisionNumber: 2, madeByLabel: "A person", message: "Changed the words of step 2", createdAt: NOW - 5 * MINUTE, snapshotSha256: null }
  ];

  it("lists newest first with who, why and when, and offers Restore only where it can", () => {
    const rows = historyRows(entries, 3, NOW);
    expect(rows.map((row) => row.title)).toEqual(["Version 3", "Version 2", "Version 1"]);
    expect(rows[0]).toMatchObject({ current: true, who: "The assistant", why: "No note was saved with this version.", when: "1 min ago" });
    expect(rows[0]?.snapshotSha256).toBeUndefined();
    expect(rows[1]?.snapshotSha256).toBeUndefined();
    expect(rows[2]).toMatchObject({ current: false, snapshotSha256: "aaa", why: "First saved version", when: "1 h ago" });
  });
});

describe("listedFlows", () => {
  const flows = [
    { flowId: "a", name: "Cheapest listings", description: "Find the cheapest listings", updatedAt: NOW - 90 * MINUTE },
    { flowId: "b", name: "Close cookie banner", description: "", updatedAt: NOW - 30 * MINUTE },
    { flowId: "c", name: "Weekly export", description: "Save rows to a file", updatedAt: NOW - 200 * MINUTE }
  ];
  const runs = [run({ runId: "old", flowId: "a", startedAt: NOW - 20 * MINUTE, status: "failed" }), run({ runId: "new", flowId: "a", startedAt: NOW - 5 * MINUTE })];

  it("shows each Flow's latest run and puts the most recently used first", () => {
    const rows = listedFlows(flows, runs, "", "p1", NOW);
    expect(rows.map((row) => row.flowId)).toEqual(["a", "b", "c"]);
    expect(rows[0]?.lastRun).toEqual({ label: "Passed", tone: "ok", ago: "5 min ago", runHref: "/runs/new" });
    expect(rows[0]?.href).toBe("/flows/a?project=p1");
    expect(rows[1]?.lastRun).toBeUndefined();
  });

  it("searches names and descriptions for every word", () => {
    expect(listedFlows(flows, runs, "listings cheap", "p1", NOW).map((row) => row.flowId)).toEqual(["a"]);
    expect(listedFlows(flows, runs, "FILE", "p1", NOW).map((row) => row.flowId)).toEqual(["c"]);
    expect(listedFlows(flows, runs, "nothing like it", "p1", NOW)).toEqual([]);
  });
});
