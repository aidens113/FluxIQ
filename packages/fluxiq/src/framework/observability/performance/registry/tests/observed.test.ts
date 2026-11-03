import { afterEach, describe, expect, it } from "vitest";
import { observationFixture } from "../../../../../runtime/execution-observation/tests/fixture.ts";
import { ExecutionCallbackPolicies } from "../../../../../runtime/execution-observation/policies/index.ts";
import { subscribeFluxIQPerformanceMetrics } from "../../subscribe.ts";
import type { FluxIQPerformanceMetric, SqlPerformanceMetric } from "../../types/index.ts";
import { publishObservedPerformanceMetric } from "../observed.ts";

const unsubscribe: Array<() => void> = [];
const metric: SqlPerformanceMetric = { kind: "sql", repositoryKind: "fixture.native", databaseName: "fixture.sqlite", operation: "all", statementType: "select", fingerprint: "synthetic-query", elapsedMs: 1, rowsReturned: 2, rowsChanged: 0, possibleFullScan: false, ok: true, recordedAt: 1 };

afterEach(() => { for (const stop of unsubscribe.splice(0)) stop(); });

describe("actual SQL telemetry callback frontier", () => {
  it("retains undefined receiver, the exact one-argument tuple and a fresh metric copy for every original subscriber", async () => {
    const f = await observationFixture();
    const seen: unknown[] = [];
    function first(this: unknown, actual: FluxIQPerformanceMetric): void {
      expect(this).toBeUndefined();
      expect(arguments.length).toBe(1);
      if (actual.kind !== "sql") throw new Error("Expected the supplied SQL metric.");
      seen.push(actual);
      actual.rowsReturned = 99;
    }
    function second(this: unknown, actual: FluxIQPerformanceMetric): void {
      expect(this).toBeUndefined();
      expect(arguments.length).toBe(1);
      if (actual.kind !== "sql") throw new Error("Expected the supplied SQL metric.");
      seen.push(actual);
      expect(actual.rowsReturned).toBe(2);
      expect(Object.keys(actual)).toEqual(Object.keys(metric));
    }
    ExecutionCallbackPolicies.rememberLexical(first, "pure");
    ExecutionCallbackPolicies.rememberLexical(second, "pure");
    unsubscribe.push(subscribeFluxIQPerformanceMetrics(first), subscribeFluxIQPerformanceMetrics(second));
    await publishObservedPerformanceMetric(metric, f.observation);
    expect(seen).toHaveLength(2);
    expect(seen[0]).not.toBe(metric);
    expect(seen[1]).not.toBe(seen[0]);
    expect(metric.rowsReturned).toBe(2);
  });

  it("awaits the actual returned Promise of an original declared computation before the next listener", async () => {
    const f = await observationFixture();
    let release!: () => void;
    let entered!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    const started = new Promise<void>(resolve => { entered = resolve; });
    const calls: string[] = [];
    const first = async (): Promise<void> => {
      calls.push("first");
      entered();
      await held;
      calls.push("completed");
    };
    const second = (): void => { calls.push("second"); };
    ExecutionCallbackPolicies.rememberLexical(first, "pure");
    ExecutionCallbackPolicies.rememberLexical(second, "pure");
    unsubscribe.push(subscribeFluxIQPerformanceMetrics(first), subscribeFluxIQPerformanceMetrics(second));
    let settled = false;
    const running = publishObservedPerformanceMetric(metric, f.observation).then(() => { settled = true; });
    await started;
    expect(settled).toBe(false);
    expect(calls).toEqual(["first"]);
    release();
    await running;
    expect(calls).toEqual(["first", "completed", "second"]);
  });

  it("retains unsupported fulfillment as terminal unknown and stops later listeners", async () => {
    const f = await observationFixture();
    let unsupportedCalls = 0;
    let laterCalls = 0;
    const unsupported = (): void => { unsupportedCalls++; };
    const later = (): void => { laterCalls++; };
    ExecutionCallbackPolicies.rememberLexical(later, "pure");
    unsubscribe.push(subscribeFluxIQPerformanceMetrics(unsupported), subscribeFluxIQPerformanceMetrics(later));
    await expect(publishObservedPerformanceMetric(metric, f.observation)).rejects.toThrow("telemetry_incomplete");
    expect(unsupportedCalls).toBe(1);
    expect(laterCalls).toBe(0);
    expect((await f.authority.consumer.inspect(f.scope)).state).toBe("pending");
    await expect(publishObservedPerformanceMetric(metric, f.observation)).rejects.toThrow("reservation_not_active");
    expect(unsupportedCalls).toBe(1);
  });
});
