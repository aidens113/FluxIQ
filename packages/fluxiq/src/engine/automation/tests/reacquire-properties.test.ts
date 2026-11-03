import { describe, expect, it } from "vitest";
import type { AutomationStudioHostRuntimeBoundary } from "../../../runtime/automation-host/index.ts";
import type { AutomationStudioTargetReacquireRequest, AutomationStudioUnboundTargetReacquireRequest } from "../../../runtime/automation-host/contracts/index.ts";
import type { ExecutionCallbackObservation } from "../../../runtime/execution-observation/index.ts";
import { enteredObservationFixture } from "../../../runtime/execution-observation/tests/frame.ts";
import { enteredAutomationFixture } from "../execution-admission/tests/frame.ts";
import { AutomationPureCallbacks } from "../execution-admission/kernel/index.ts";
import { automationStudioReacquireHostAnswer, automationStudioReacquireSourcePlace } from "../target-reacquire/index.ts";
import { automationStudioUnboundReacquireAnswer } from "../unbound-reacquire/index.ts";
import { automationStudioRefreshFloor } from "../parameter-refresh/index.ts";

const node = { id: "step", definitionId: "example.step" };
const source = { id: "source", definitionId: "example.read" };
const failure = { category: "target_not_found" as const, code: "missing", retryable: true, effect: "unacted" as const };
const request: AutomationStudioTargetReacquireRequest = { node, source, lineage: { kind: "output", sourceNodeId: source.id, outputKey: "item" }, stale: "old", candidates: ["fresh"], failure };
const unbound: AutomationStudioUnboundTargetReacquireRequest = { node, parameters: {}, refresh: { container: "node", definitionId: node.definitionId, definitionVersion: "1.0.0", parameterIds: [], removableParameterIds: [] }, previousAttempt: { attemptId: "attempt" }, failure };
const cases: Array<{ key: keyof AutomationStudioHostRuntimeBoundary; reply: unknown; catches: boolean; invoke(host: AutomationStudioHostRuntimeBoundary, observation?: ExecutionCallbackObservation): Promise<unknown> }> = [
  { key: "reacquireTarget", reply: { outcome: "found", value: "fresh" }, catches: true, invoke: (host, observation) => automationStudioReacquireHostAnswer(host, request, observation) },
  { key: "reacquireUnboundTarget", reply: { outcome: "found", patches: [] }, catches: true, invoke: (host, observation) => automationStudioUnboundReacquireAnswer(host, unbound, observation) },
  { key: "returnToSourcePlace", reply: "returned", catches: false, invoke: (host, observation) => automationStudioReacquireSourcePlace({ host, node, source, attempts: [] }, observation) }
];

describe.each(cases)("$key original retry adapter", entry => {
  it.each(["own", "inherited"] as const)("fences a caught %s getter without calling it", async placement => {
    const f = await enteredObservationFixture();
    let reads = 0;
    await f.run(async observation => {
      const owner = { capabilities: [] };
      Object.defineProperty(owner, entry.key, { get() {
        reads++;
        return () => entry.reply;
      } });
      const host: AutomationStudioHostRuntimeBoundary = placement === "own" ? owner : Object.create(owner);
      if (entry.catches) expect(await entry.invoke(host, observation)).toEqual({ outcome: "unmatched", reason: "host_failed" });
      else await expect(entry.invoke(host, observation)).rejects.toThrow("callback_accessor_unsupported");
    });
    expect(reads).toBe(0);
    await f.pending();
  });

  it("retains a private receiver and one original request argument", async () => {
    const f = await enteredObservationFixture();
    class Host {
      readonly capabilities = [];
      #calls = 0;
      get calls() { return this.#calls; }
      callback(received: unknown) {
        this.#calls++;
        expect(arguments.length).toBe(1);
        if (entry.key === "reacquireTarget") expect(received).toBe(request);
        else if (entry.key === "reacquireUnboundTarget") expect(received).toBe(unbound);
        else expect(received).toEqual({ node, source });
        return entry.reply;
      }
    }
    const host = new Host();
    Object.defineProperty(Host.prototype, entry.key, { value: Host.prototype.callback });
    f.source.manage({ receiver: host, callback: host.callback, contract: "no_direct_effects" });
    await f.run(async observation => { expect(await entry.invoke(host, observation)).toEqual(entry.reply); });
    expect(host.calls).toBe(1);
  });

  it("preserves unobserved accessors", async () => {
    const host: AutomationStudioHostRuntimeBoundary = { capabilities: [] };
    let reads = 0;
    Object.defineProperty(host, entry.key, { get() {
      reads++;
      return function (this: AutomationStudioHostRuntimeBoundary) {
        expect(this).toBe(host);
        return entry.reply;
      };
    } });
    expect(await entry.invoke(host)).toEqual(entry.reply);
    expect(reads).toBe(1);
  });
});

it("fences a refresh resolver replaced after its first call while preserving its original tuple", async () => {
  const f = await enteredAutomationFixture();
  let calls = 0;
  let reads = 0;
  const before = { value: "before" };
  await f.run(async options => {
    const resolver: NonNullable<typeof options.resolveActionEffect> = function (this: typeof options, received, parameters) {
      calls++;
      expect(this).toBe(options);
      expect(received).toBe(node);
      expect(parameters).toBe(before);
      expect(arguments.length).toBe(2);
      Object.defineProperty(options, "resolveActionEffect", { get() {
        reads++;
        return () => undefined;
      } });
      return { effectClass: "observe", permissionConsequences: [] };
    };
    AutomationPureCallbacks.registerLexical(resolver);
    options.resolveActionEffect = resolver;
    expect(automationStudioRefreshFloor(node, before, { value: "after" }, options)).toEqual({ kind: "unreadable", reason: "action_effect_unavailable" });
  });
  expect(calls).toBe(1);
  expect(reads).toBe(0);
  await f.pending();
});
