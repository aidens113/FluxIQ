import { describe, expect, it } from "vitest";
import { ANY_RUN_FILTER } from "../any-run-filter";
import { filterRuns } from "../filter-runs";
import { flowOptions } from "../flow-options";
import { readRunExtras } from "../read-run-extras";
import { resultGroup } from "../result-group";
import { runFacts } from "../run-facts";
import { runHeadline } from "../run-headline";
import { shapeRunRow } from "../shape-run-row";
import type { RunRow } from "../types";

const NOW = 1_000_000_000_000;
const MIN = 60_000;
function row(over: Partial<RunRow> & { runId: string }): RunRow {
  return { flowId: "f1", projectId: "p1", flowName: "Cheapest listings", status: "succeeded", startedAt: NOW - MIN, ...over };
}

describe("readRunExtras", () => {
  it("keeps only what the run states in known words", () => {
    expect(readRunExtras({ client: "Chrome extension", runMode: "replay", startedBy: "Aiden", verdictBy: "check" }))
      .toEqual({ client: "extension", howRan: "replayed", startedBy: "Aiden", confirmedBy: "check" });
    expect(readRunExtras({ client: "mystery", verdictBy: "vibes" })).toEqual({});
    expect(readRunExtras(undefined)).toEqual({});
  });
});

describe("shapeRunRow", () => {
  const names = new Map([["f1", "Cheapest listings"]]);
  it("adds steps and metadata to the shared run shape", () => {
    const shaped = shapeRunRow({ runId: "r1", flowId: "f1", projectId: "p1", status: "succeeded", startedAt: 5, actionAttemptCount: 6, metadata: { client: "panel" } }, names);
    expect(shaped).toMatchObject({ runId: "r1", steps: 6, client: "panel", flowName: "Cheapest listings" });
    expect(shapeRunRow({ flowId: "f1" }, names)).toBeUndefined();
  });
});

describe("resultGroup", () => {
  it("groups statuses as a person filters them", () => {
    expect(["succeeded", "failed", "interrupted", "cancelled", "waiting", "weird"].map(resultGroup))
      .toEqual(["passed", "failed", "failed", "stopped", "running", "failed"]);
  });
});

describe("filterRuns", () => {
  const rows = [
    row({ runId: "a", startedAt: 1, client: "extension" }),
    row({ runId: "b", startedAt: 3, flowId: "f2", flowName: "Post reply", status: "failed", client: "program" }),
    row({ runId: "c", startedAt: 2 })
  ];
  it("keeps everything for the any filter, newest first", () => {
    expect(filterRuns(rows, ANY_RUN_FILTER).map((r) => r.runId)).toEqual(["b", "c", "a"]);
  });
  it("combines Flow, client and result", () => {
    expect(filterRuns(rows, { ...ANY_RUN_FILTER, flowId: "f2" }).map((r) => r.runId)).toEqual(["b"]);
    expect(filterRuns(rows, { ...ANY_RUN_FILTER, client: "extension" }).map((r) => r.runId)).toEqual(["a"]);
    expect(filterRuns(rows, { ...ANY_RUN_FILTER, client: "unknown" }).map((r) => r.runId)).toEqual(["c"]);
    expect(filterRuns(rows, { ...ANY_RUN_FILTER, result: "failed" }).map((r) => r.runId)).toEqual(["b"]);
    expect(filterRuns(rows, { flowId: "f2", client: "extension", result: "any" })).toEqual([]);
  });
});

describe("flowOptions", () => {
  it("lists each Flow once, by name", () => {
    expect(flowOptions([row({ runId: "a" }), row({ runId: "b" }), row({ runId: "c", flowId: "f0", flowName: "Alpha" })]))
      .toEqual([{ flowId: "f0", name: "Alpha" }, { flowId: "f1", name: "Cheapest listings" }]);
  });
});

describe("runFacts", () => {
  it("says only what was recorded", () => {
    expect(runFacts(row({ runId: "a", costUsd: 0, steps: 1, howRan: "replayed", client: "program", startedBy: "ci" }), NOW).details)
      .toEqual(["replayed", "$0.00", "1 step", "Your program", "started by ci", "1 min ago"]);
    expect(runFacts(row({ runId: "b" }), NOW).details).toEqual(["cost not recorded", "1 min ago"]);
    expect(runFacts(row({ runId: "c", status: "failed" }), NOW).result).toEqual({ label: "Failed", tone: "bad" });
  });
});

describe("runHeadline", () => {
  it("reads as one plain line", () => {
    expect(runHeadline(row({ runId: "a", costUsd: 0, startedAt: 0, finishedAt: 6100, confirmedBy: "check" })))
      .toBe("Cheapest listings · Passed (confirmed by your check) · $0.00 · 6 s");
    expect(runHeadline(row({ runId: "b", status: "failed" }))).toBe("Cheapest listings · Failed");
  });
});
