import { describe, expect, it } from "vitest";
import {
  AUTOMATION_STUDIO_MAX_NODE_RETRY_WAIT_MS,
  AUTOMATION_STUDIO_MAX_RETRY_WAIT_MS,
  AUTOMATION_STUDIO_MAX_RUN_RETRY_WAIT_MS,
  automationStudioBoundedRetryWaitMs,
  automationStudioDefenceLedger,
  automationStudioRunMayStillAbsorb
} from "../index.ts";

describe("the wait before another attempt is bounded at three levels", () => {
  it("takes the longer of the backoff table and the delay the source asked for", () => {
    expect(automationStudioBoundedRetryWaitMs({ backoffMs: 250, hintedWaitMs: 2_000, nodeWaitedMs: 0, runWaitedMs: 0 })).toEqual({ waitMs: 2_000, bounded: false });
    expect(automationStudioBoundedRetryWaitMs({ backoffMs: 5_000, hintedWaitMs: 1_000, nodeWaitedMs: 0, runWaitedMs: 0 })).toEqual({ waitMs: 5_000, bounded: false });
  });

  it("holds one wait to the per-attempt bound", () => {
    expect(automationStudioBoundedRetryWaitMs({ backoffMs: 600_000, nodeWaitedMs: 0, runWaitedMs: 0 })).toEqual({ waitMs: AUTOMATION_STUDIO_MAX_RETRY_WAIT_MS, bounded: true });
  });

  it("holds every wait at one node to the per-node bound", () => {
    const spent = AUTOMATION_STUDIO_MAX_NODE_RETRY_WAIT_MS - 1_000;

    expect(automationStudioBoundedRetryWaitMs({ backoffMs: 30_000, nodeWaitedMs: spent, runWaitedMs: spent })).toEqual({ waitMs: 1_000, bounded: true });
    expect(automationStudioBoundedRetryWaitMs({ backoffMs: 30_000, nodeWaitedMs: AUTOMATION_STUDIO_MAX_NODE_RETRY_WAIT_MS, runWaitedMs: 0 })).toEqual({ waitMs: 0, bounded: true });
  });

  it("holds every wait in the run to the per-run bound, and then stops absorbing at all", () => {
    expect(automationStudioBoundedRetryWaitMs({ backoffMs: 10_000, nodeWaitedMs: 0, runWaitedMs: AUTOMATION_STUDIO_MAX_RUN_RETRY_WAIT_MS - 250 })).toEqual({ waitMs: 250, bounded: true });
    expect(automationStudioRunMayStillAbsorb(AUTOMATION_STUDIO_MAX_RUN_RETRY_WAIT_MS - 1)).toBe(true);
    expect(automationStudioRunMayStillAbsorb(AUTOMATION_STUDIO_MAX_RUN_RETRY_WAIT_MS)).toBe(false);
  });

  it("states a worst case rather than leaving one to be discovered", () => {
    // One wait never exceeds 30 s, all the waits at one arrival at one node never
    // exceed 60 s, and all the waits in a run never exceed 5 minutes. Anything
    // past that is node execution time, which regions and Call Flow deadlines bound.
    expect(AUTOMATION_STUDIO_MAX_RETRY_WAIT_MS).toBe(30_000);
    expect(AUTOMATION_STUDIO_MAX_NODE_RETRY_WAIT_MS).toBe(60_000);
    expect(AUTOMATION_STUDIO_MAX_RUN_RETRY_WAIT_MS).toBe(300_000);
  });

  it("treats a nonsense figure as no waiting spent rather than as a licence", () => {
    expect(automationStudioBoundedRetryWaitMs({ backoffMs: Number.NaN, nodeWaitedMs: Number.NaN, runWaitedMs: -5 }).waitMs).toBe(0);
  });
});

describe("the run keeps a ledger of what it survived", () => {
  const fault = { category: "timeout" as const, code: "executor.fault.status.503", source: "thrown_error" as const, effect: "unacted" as const, reason: "503" };

  it("has nothing to report on a run that met no fault", () => {
    expect(automationStudioDefenceLedger().summary()).toBeUndefined();
  });

  it("counts absorbed and refused faults apart, and totals the waiting", () => {
    const ledger = automationStudioDefenceLedger();
    ledger.record({ nodeId: "act", attemptId: "act.attempt.1", attemptNumber: 1, outcome: "retried", waitedMs: 250, ...fault });
    ledger.record({ nodeId: "act", attemptId: "act.attempt.2", attemptNumber: 2, outcome: "retried", waitedMs: 1_000, ...fault });
    ledger.record({ nodeId: "act", attemptId: "act.attempt.3", attemptNumber: 3, outcome: "stopped", waitedMs: 0, ...fault });

    expect(ledger.summary()).toMatchObject({ absorbedCount: 2, refusedCount: 1, faultCount: 3, waitedMs: 1_250, waitBudgetMs: AUTOMATION_STUDIO_MAX_RUN_RETRY_WAIT_MS });
    expect(ledger.summary()?.entries).toHaveLength(3);
    expect(ledger.runWaitedMs()).toBe(1_250);
    expect(ledger.nodeWaitedMs("act")).toBe(1_250);
  });

  it("gives a fresh arrival at a node a fresh waiting allowance, and never resets the run's", () => {
    const ledger = automationStudioDefenceLedger();
    ledger.record({ nodeId: "act", attemptId: "act.attempt.1", attemptNumber: 1, outcome: "retried", waitedMs: 5_000, ...fault });
    ledger.leaveNode();

    expect(ledger.nodeWaitedMs("act")).toBe(0);
    expect(ledger.runWaitedMs()).toBe(5_000);
  });

  it("names the nodes the Flow was allowed to walk past", () => {
    const ledger = automationStudioDefenceLedger();
    ledger.record({ nodeId: "banner", attemptId: "banner.attempt.1", attemptNumber: 1, outcome: "continued", waitedMs: 0, ...fault });
    ledger.continuePast("banner");
    ledger.continuePast("banner");

    expect(ledger.summary()?.continuedPastNodeIds).toEqual(["banner"]);
  });
});
