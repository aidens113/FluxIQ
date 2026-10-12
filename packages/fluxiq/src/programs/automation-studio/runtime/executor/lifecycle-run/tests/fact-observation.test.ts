import { describe, expect, it } from "vitest";
import type { AutomationStudioHostRuntimeBoundary } from "../../../host-runtime.ts";
import { automationStudioHostFactConditionResult, observeAutomationStudioFacts } from "../index.ts";
import { fakeHost } from "./lifecycle-fixtures.ts";

const now = () => 7;

describe("observeAutomationStudioFacts", () => {
  it("makes no call when there are no conditions", async () => {
    const host = fakeHost();
    const observation = await observeAutomationStudioFacts({ hostRuntime: host.runtime, groups: [{ key: "when", conditions: [] }], context: {}, now });
    expect(observation.calls).toBe(0);
    expect(observation.results.get("when")).toEqual([]);
    expect(host.batches).toEqual([]);
  });

  it("asks every group's conditions in one call and hands each group its own answers, with frame inputs and run values", async () => {
    const host = fakeHost({ a: "true", b: "false", c: "unknown" });
    const observation = await observeAutomationStudioFacts({
      hostRuntime: host.runtime,
      groups: [
        { key: "one", conditions: [{ fact: "a", op: "equals", value: { input: "query" } }] },
        { key: "two", conditions: [{ fact: "b", op: "contains", value: { value: "row.name" } }, { fact: "c", op: "exists" }] }
      ],
      context: { inputs: { query: "shoes" }, values: { "row.name": "Ada" }, nodeId: "press" },
      now
    });
    expect(observation.calls).toBe(1);
    expect(host.batches).toHaveLength(1);
    expect(host.batches[0]?.conditions.map((condition) => condition.fact)).toEqual(["a", "b", "c"]);
    expect(host.batches[0]?.conditions[0]).toEqual({ fact: "a", op: "equals", value: { input: "query" } });
    expect(host.batches[0]?.context).toEqual({ inputs: { query: "shoes" }, values: { "row.name": "Ada" }, nodeId: "press" });
    expect(observation.results.get("one")?.map((result) => result.truth)).toEqual(["true"]);
    expect(observation.results.get("two")?.map((result) => result.truth)).toEqual(["false", "unknown"]);
    expect(observation.results.get("one")?.[0]).toMatchObject({ capturedAt: 50, evidenceRef: expect.stringMatching(/^evidence:[0-9a-f]{16}$/) });
  });

  it("never sends a malformed condition or a target still holding a handle, and answers them unknown", async () => {
    const host = fakeHost({ ok: "true" });
    const observation = await observeAutomationStudioFacts({
      hostRuntime: host.runtime,
      groups: [{ key: "g", conditions: [{ fact: "ok", op: "exists" }, { fact: "", op: "exists" }, { kind: "element_visible", selector: "#x" }, { fact: "ok", op: "visible", target: { element: { handle: "h-12" } } }] }],
      context: {},
      now
    });
    expect(host.batches[0]?.conditions).toEqual([{ fact: "ok", op: "exists" }]);
    expect(observation.results.get("g")).toEqual([
      expect.objectContaining({ truth: "true" }),
      { truth: "unknown", evidenceRef: "core:malformed", capturedAt: 7 },
      { truth: "unknown", evidenceRef: "core:malformed", capturedAt: 7 },
      { truth: "unknown", evidenceRef: "core:unresolved_handle", capturedAt: 7 }
    ]);
  });

  it("answers every condition unknown when the host is missing, throws, or answers the wrong number", async () => {
    const groups = [{ key: "g", conditions: [{ fact: "a", op: "exists" as const }, { fact: "b", op: "exists" as const }] }];
    const truths = (observation: Awaited<ReturnType<typeof observeAutomationStudioFacts>>) => observation.results.get("g")?.map((result) => `${result.truth}:${result.evidenceRef}`);

    const missing = await observeAutomationStudioFacts({ hostRuntime: { capabilities: [] }, groups, context: {}, now });
    expect(missing.calls).toBe(0);
    expect(truths(missing)).toEqual(["unknown:core:no_fact_evaluation", "unknown:core:no_fact_evaluation"]);

    const throwing: AutomationStudioHostRuntimeBoundary = { capabilities: ["fact-evaluation"], factEvaluator: () => { throw new Error("socket closed"); } };
    const threw = await observeAutomationStudioFacts({ hostRuntime: throwing, groups, context: {}, now });
    expect(threw.calls).toBe(1);
    expect(truths(threw)).toEqual(["unknown:core:host_failed", "unknown:core:host_failed"]);
    expect(threw.problem).toContain("socket closed");

    const short: AutomationStudioHostRuntimeBoundary = { capabilities: ["fact-evaluation"], factEvaluator: async () => [{ result: "true", capturedAt: 1 }] };
    const wrongLength = await observeAutomationStudioFacts({ hostRuntime: short, groups, context: {}, now });
    expect(truths(wrongLength)).toEqual(["unknown:core:host_batch_length", "unknown:core:host_batch_length"]);

    const aborted = new AbortController();
    aborted.abort();
    const cancelled = await observeAutomationStudioFacts({ hostRuntime: short, groups, context: { signal: aborted.signal }, now });
    expect(cancelled.calls).toBe(0);
    expect(truths(cancelled)).toEqual(["unknown:core:cancelled", "unknown:core:cancelled"]);
  });
});

describe("automationStudioHostFactConditionResult", () => {
  it("keeps a bounded reference, never the host's evidence or a prose reference", () => {
    expect(automationStudioHostFactConditionResult({ result: "true", evidenceRef: "fact:12/visible", capturedAt: 3 }, 9)).toEqual({ truth: "true", evidenceRef: "fact:12/visible", capturedAt: 3 });
    const fromEvidence = automationStudioHostFactConditionResult({ result: "false", evidenceRef: "the page says Sold out", evidence: { excerpt: "Sold out" }, capturedAt: 3 }, 9);
    expect(fromEvidence.evidenceRef).toMatch(/^evidence:[0-9a-f]{16}$/);
    expect(JSON.stringify(fromEvidence)).not.toContain("Sold");
    // The same evidence in another key order digests the same.
    expect(automationStudioHostFactConditionResult({ result: "true", evidence: { a: 1, b: 2 }, capturedAt: 1 }, 9).evidenceRef)
      .toBe(automationStudioHostFactConditionResult({ result: "true", evidence: { b: 2, a: 1 }, capturedAt: 1 }, 9).evidenceRef);
    expect(automationStudioHostFactConditionResult({ result: "yes", capturedAt: "soon" }, 9)).toEqual({ truth: "unknown", evidenceRef: "core:unreadable_answer", capturedAt: 9 });
    expect(automationStudioHostFactConditionResult({ result: "unknown", capturedAt: 4 }, 9)).toEqual({ truth: "unknown", capturedAt: 4 });
  });
});
