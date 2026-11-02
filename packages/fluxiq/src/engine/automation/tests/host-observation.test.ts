import { expect, it } from "vitest";
import type { AutomationStudioHostRuntimeBoundary } from "../../../runtime/automation-host/index.ts";
import type { ExecutionCallbackCompletionConfiguration } from "../../../runtime/execution-observation/index.ts";
import type { AutomationStudioGraphExecutionOptions, AutomationStudioNodeAttemptTrace } from "../index.ts";
import type { AutomationStudioFlowNode } from "../../../flows/executable/graph/index.ts";
import { automationStudioHostEffectCheck } from "../transitions/index.ts";
import { automationStudioAwaitNodeReadiness } from "../recovery/index.ts";
import { runAutomationStudioGraph } from "../index.ts";
import { observedHostFixture } from "./observed-host.ts";

type Evaluator = NonNullable<AutomationStudioHostRuntimeBoundary["expectationEvaluator"]>;
type Kind = "effect" | "readiness";
const conditions = [{ path: "isolated.value" }];
const state = { conditions, mode: "all", timeoutMs: 300 };
const node: AutomationStudioFlowNode = { id: "check", definitionId: "builtin.policy.action", parameterValues: { expectedState: state, readyState: state } };
const stateRef = { stateSnapshotId: "snapshot.actual", stateRef: "fixture.actual-state", capturedAt: 1 };
const attempt: AutomationStudioNodeAttemptTrace = { attemptId: "attempt.actual", nodeId: node.id, definitionId: node.definitionId, startedAt: 1, finishedAt: 2, status: "failed", route: "failed", inputs: {}, outputs: {}, effects: [], stateRefs: { afterAction: stateRef } };

class Host {
  readonly capabilities: string[] = [];
  #calls = 0;
  constructor(private readonly original: Evaluator) {}
  expectationEvaluator(...args: Parameters<Evaluator>): ReturnType<Evaluator> {
    this.#calls += 1;
    return this.original(...args);
  }
  calls(): number { return this.#calls; }
}

const pure = (host: Host): ExecutionCallbackCompletionConfiguration => ({ configure(registrar) {
  registrar.manage({ receiver: host, callback: host.expectationEvaluator, contract: "no_direct_effects" });
} });

function probe(kind: Kind, options: AutomationStudioGraphExecutionOptions, checkedNode = node) {
  return kind === "effect" ? automationStudioHostEffectCheck(checkedNode, options)(attempt, 1) : automationStudioAwaitNodeReadiness(checkedNode, options, attempt.attemptId);
}

function entered(f: Awaited<ReturnType<typeof observedHostFixture>>, nested = false): void {
  const current = [...f.store.rows.values()].at(-1)!;
  expect(current.row.sourceKey).toBe("automation.engine");
  expect(current.closed).toBe(false);
  if (nested) expect(current.row.parentId).not.toBe(f.authority.entryBridge.read(f.reserved.root).row.entryId);
}

it.each(["effect", "readiness"] as const)("observes the original private %s evaluator before calling its unchanged tuple", async kind => {
  let f: Awaited<ReturnType<typeof observedHostFixture>>;
  const host = new Host((actual, mode, timeout, context) => {
    entered(f);
    expect(actual).toBe(conditions);
    expect(mode).toBe("all");
    expect(timeout).toBe(2_000);
    expect(context).toEqual({ source: "transition_comparison", nodeId: node.id, attemptId: attempt.attemptId, signal: f.abort.signal, ...(kind === "effect" ? { stateRef: stateRef.stateRef } : {}) });
    return { passed: true, checkedConditionCount: 1 };
  });
  f = await observedHostFixture(host, pure(host));
  const result = await probe(kind, f.options);
  if (kind === "effect") expect(result).toBe("landed");
  else expect(result).toMatchObject({ satisfied: true, checkedConditionCount: 1 });
  expect(host.calls()).toBe(1);
  expect([...f.store.rows.values()].at(-1)?.closed).toBe(true);
  expect((await f.authority.consumer.inspect(f.scope)).state).not.toBe("clear");
});

it.each(["effect", "readiness"] as const)("pins the selected %s callback before the observed entry await", async kind => {
  const host = new Host(() => ({ passed: true, checkedConditionCount: 1 }));
  const f = await observedHostFixture(host, pure(host));
  const paused = f.store.pauseNext("enter");
  let replacements = 0;
  const checking = probe(kind, f.options);
  const progress = Promise.race([paused.entered.then(() => "entered"), checking.then(() => "returned", () => "rejected")]);
  try {
    expect(await progress).toBe("entered");
    host.expectationEvaluator = () => {
      replacements += 1;
      return { passed: false };
    };
  } finally { paused.release(); }
  const result = await checking;
  if (kind === "effect") expect(result).toBe("landed");
  else expect(result).toMatchObject({ satisfied: true });
  expect(host.calls()).toBe(1);
  expect(replacements).toBe(0);
});

it.each(["effect", "readiness"] as const)("retains the first unsupported %s verdict without completion credit", async kind => {
  const host = new Host(() => ({ passed: true, checkedConditionCount: 1 }));
  const f = await observedHostFixture(host);
  const result = await probe(kind, f.options);
  if (kind === "effect") expect(result).toBe("landed");
  else expect(result).toMatchObject({ satisfied: true });
  const current = [...f.store.rows.values()].at(-1)!;
  expect(current.row.sourceKey).toBe("automation.engine");
  expect(current.facts).toContainEqual(expect.objectContaining({ kind: "returned_unverified" }));
  expect(current.closed).toBe(false);
});

it.each(["effect", "readiness"] as const)("does not invoke an unsupported %s callback twice after its actual throw", async kind => {
  const failure = new Error("actual host acknowledgement lost");
  let commits = 0;
  const host = new Host(() => {
    commits += 1;
    throw failure;
  });
  const f = await observedHostFixture(host);
  const first = probe(kind, f.options);
  if (kind === "effect") await expect(first).rejects.toBe(failure);
  else expect(await first).toMatchObject({ satisfied: false, checkedConditionCount: 0, message: failure.message });
  await probe(kind, f.options).then(() => undefined, () => undefined);
  expect(host.calls()).toBe(1);
  expect(commits).toBe(1);
  expect((await f.authority.consumer.inspect(f.scope)).state).toBe("pending");
});

it.each(["effect", "readiness"] as const)("allows the original declared no-direct-effects %s read to retry after throw", async kind => {
  const failure = new Error("original read unavailable");
  let calls = 0;
  const host = new Host(() => {
    calls += 1;
    if (calls === 1) throw failure;
    return { passed: true, checkedConditionCount: 1 };
  });
  const f = await observedHostFixture(host, pure(host));
  if (kind === "effect") await expect(probe(kind, f.options)).rejects.toBe(failure);
  else expect(await probe(kind, f.options)).toMatchObject({ satisfied: false });
  const second = await probe(kind, f.options);
  if (kind === "effect") expect(second).toBe("landed");
  else expect(second).toMatchObject({ satisfied: true });
  expect(host.calls()).toBe(2);
  expect([...f.store.rows.values()].filter(row => row.row.sourceKey === "automation.engine").every(row => row.closed)).toBe(true);
});

it.each(["effect", "readiness"] as const)("does not certify a late %s answer after its actual reservation was aborted", async kind => {
  let release: (value: { passed: boolean; checkedConditionCount: number }) => void = () => undefined;
  const held = new Promise<{ passed: boolean; checkedConditionCount: number }>(resolve => { release = resolve; });
  let arrived: () => void = () => undefined;
  const called = new Promise<void>(resolve => { arrived = resolve; });
  const host = new Host(() => {
    arrived();
    return held;
  });
  const f = await observedHostFixture(host);
  const checking = probe(kind, f.options).then(value => ({ value }), error => ({ error }));
  expect(await Promise.race([called.then(() => "called"), checking.then(() => "ended")])).toBe("called");
  f.abort.abort();
  release({ passed: false, checkedConditionCount: 1 });
  await checking;
  expect((await f.authority.consumer.inspect(f.scope)).state).toBe("pending");
  await probe(kind, f.options).then(() => undefined, () => undefined);
  expect(host.calls()).toBe(1);
});

it.each(["effect", "readiness"] as const)("does not invoke available %s callbacks without a state, or fabricate a callback without a host", async kind => {
  const host = new Host(() => { throw new Error("unused evaluator invoked"); });
  const f = await observedHostFixture(host);
  const before = f.store.rows.size;
  await probe(kind, f.options, { id: "no-state", definitionId: "builtin.control.start" });
  const absent = await observedHostFixture();
  const absentBefore = absent.store.rows.size;
  await probe(kind, absent.options);
  expect(host.calls()).toBe(0);
  expect(f.store.rows.size).toBe(before);
  expect(absent.store.rows.size).toBe(absentBefore);
});

it.each([true, false])("observes both actual entry and success fact callbacks (declared=%s)", async declared => {
  let f: Awaited<ReturnType<typeof observedHostFixture>>;
  class Facts {
    readonly capabilities = ["fact-evaluation"];
    #calls = 0;
    factEvaluator(...args: Parameters<NonNullable<AutomationStudioHostRuntimeBoundary["factEvaluator"]>>) {
      this.#calls += 1;
      entered(f, true);
      expect(Object.keys(args[1]).sort()).toEqual(["inputs", "nodeId", "signal", "values"]);
      return args[0].map(() => ({ result: "true" as const, capturedAt: 1 }));
    }
    calls(): number { return this.#calls; }
  }
  const host = new Facts();
  const configuration: ExecutionCallbackCompletionConfiguration = { configure(registrar) {
    if (declared) registrar.manage({ receiver: host, callback: host.factEvaluator, contract: "no_direct_effects" });
  } };
  f = await observedHostFixture(host, configuration);
  const trace = await runAutomationStudioGraph({ flowId: "flow.facts", nodes: [
    { id: "start", definitionId: "builtin.control.start" },
    { id: "alternative", definitionId: "builtin.control.end", metadata: { "fluxiq.entry": { id: "actual-entry", order: 1, when: [{ fact: "entry.actual", op: "exists" }], requires: [] } } }
  ], edges: [], metadata: { "fluxiq.successCheck": [{ fact: "success.actual", op: "exists" }] } }, f.options);
  expect(trace.status).toBe("succeeded");
  expect(trace.attempts.map(value => value.nodeId)).toEqual(["alternative"]);
  expect(trace.successCheck?.truth).toBe("true");
  expect(host.calls()).toBe(2);
  const unsupported = [...f.store.rows.values()].filter(row => row.facts.some(fact => fact.kind === "returned_unverified"));
  if (declared) expect(unsupported).toHaveLength(0);
  else expect(unsupported.filter(row => row.row.parentId !== f.authority.entryBridge.read(f.reserved.root).row.entryId).length).toBeGreaterThanOrEqual(2);
});

it("does not invoke a fact evaluator when entry and success conditions are empty", async () => {
  let calls = 0;
  const f = await observedHostFixture({ capabilities: [], factEvaluator() {
    calls += 1;
    throw new Error("empty condition batch invoked");
  } });
  const trace = await runAutomationStudioGraph({ flowId: "flow.empty-facts", nodes: [
    { id: "start", definitionId: "builtin.control.start" },
    { id: "alternative", definitionId: "builtin.control.end", metadata: { "fluxiq.entry": { id: "empty-entry", when: [], requires: [] } } }
  ], edges: [], metadata: { "fluxiq.successCheck": [] } }, f.options);
  expect(trace.status).toBe("succeeded");
  expect(calls).toBe(0);
  expect(trace.successCheck).toBeUndefined();
});
