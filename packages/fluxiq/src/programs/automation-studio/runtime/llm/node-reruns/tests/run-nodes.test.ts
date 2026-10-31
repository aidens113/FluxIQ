import { describe, expect, it, vi } from "vitest";
// The initialized LLM barrel first, as the run-flow tests require for shared runtime imports.
import {
  AUTOMATION_STUDIO_LLM_RUN_NODES_TOOL_ID,
  automationStudioLlmRunNodesOriginal,
  automationStudioLlmRunNodesTool,
  runAutomationStudioLlmPriorNodes,
  type AutomationStudioLlmRunNodesInput,
  type AutomationStudioLlmRunNodesPorts,
  type AutomationStudioLlmRunNodesPriorCall
} from "../../index.ts";
import type { JsonObject } from "../../../../../../core/index.ts";
import { resolveAutomationStudioNodeActionEffect, type AutomationStudioResolvedActionEffect } from "../../../../nodes/action-effect/index.ts";
import type { AutomationStudioLlmEvidenceToolExecutionResult } from "../../evidence-loop.ts";
import { automationStudioLlmEvidenceValidTools } from "../../evidence-loop-decision.ts";

const OBSERVE: AutomationStudioResolvedActionEffect = { effectClass: "observe", permissionConsequences: [] };
const STATE: AutomationStudioResolvedActionEffect = { effectClass: "state", permissionConsequences: [], repeatSafe: true };
const COMMIT: AutomationStudioResolvedActionEffect = { effectClass: "commit", permissionConsequences: [] };

function execution(resultCode: string | undefined = "spec.read", over: Partial<AutomationStudioLlmEvidenceToolExecutionResult> = {}): AutomationStudioLlmEvidenceToolExecutionResult {
  const value: AutomationStudioLlmEvidenceToolExecutionResult = {
    kind: "llm_evidence_tool_execution",
    evidence: { ok: true, values: ["first", "second"] },
    effectApplied: false
  };
  if (resultCode !== undefined) value.resultCode = resultCode;
  return { ...value, ...over };
}

function original(callId: string, over: Partial<AutomationStudioLlmRunNodesPriorCall> = {}): AutomationStudioLlmRunNodesPriorCall {
  return {
    callId,
    loopId: "live-loop",
    toolId: "core.run_node",
    definitionId: `spec.read.${callId}`,
    definitionVersion: "1.0.0",
    input: { node: `spec.read.${callId}`, parameters: { field: "name" }, consequences: [] },
    effectiveInputs: {},
    execution: execution(),
    authorityKey: "registry:1:grants:1",
    actionEffect: OBSERVE,
    ...over
  };
}

function harness(over: Partial<AutomationStudioLlmRunNodesPorts> = {}) {
  const registry = new Map(["a", "b", "c"].map((callId) => [callId, original(callId)]));
  const runMember = vi.fn<AutomationStudioLlmRunNodesPorts["runMember"]>(async ({ index }) => ({ callId: `actual.${index}`, result: execution() }));
  const admitted = vi.fn<AutomationStudioLlmRunNodesPorts["listGuard"]["admit"]>(() => true);
  const recorded = vi.fn<AutomationStudioLlmRunNodesPorts["listGuard"]["recorded"]>(() => undefined);
  const ports: AutomationStudioLlmRunNodesPorts = {
    lookupPriorCall: (callId) => registry.get(callId),
    resolveAuthority: (prior) => ({ definitionId: prior.definitionId, definitionVersion: prior.definitionVersion, authorityKey: prior.authorityKey }),
    resolveRerunEffect: () => OBSERVE,
    runMember,
    allowance: () => ({ allowed: true }),
    listGuard: { admit: admitted, recorded },
    ...over
  };
  const input: AutomationStudioLlmRunNodesInput = { loopId: "live-loop", value: { calls: ["a", "b", "c"] }, world: { place: "world:1", draft: "draft:1" }, ports };
  return { registry, runMember, admitted, recorded, ports, input };
}

describe("prior-call batch declaration", () => {
  it("has only a nonempty unique ordered call list and remains a fresh uninstalled declaration", () => {
    const tool = automationStudioLlmRunNodesTool();
    expect(tool.toolId).toBe(AUTOMATION_STUDIO_LLM_RUN_NODES_TOOL_ID);
    expect(tool.toolId).toBe("core.run_nodes");
    expect(tool.inputSchema).toEqual({
      type: "object", additionalProperties: false, required: ["calls"],
      properties: { calls: { type: "array", minItems: 1, uniqueItems: true, items: { type: "string", minLength: 1 }, description: expect.any(String) } }
    });
    expect(automationStudioLlmEvidenceValidTools([tool])).toBe(true);
    expect(tool.description).toContain("never a judged whole-Flow test");
    tool.inputSchema.changed = true;
    expect(automationStudioLlmRunNodesTool().inputSchema.changed).toBeUndefined();
  });
});

describe("prior-call batch coordinator", () => {
  it("runs the requested originals in order with unchanged concrete inputs and preserves each raw receipt", async () => {
    const h = harness();
    const actual = [execution(), execution(), execution()];
    h.runMember.mockImplementation(async ({ index }) => ({ callId: `actual.${index}`, result: actual[index] }));
    h.input.value = { calls: ["c", "a", "b"] };
    const before = structuredClone([...h.registry.values()]);
    const result = await runAutomationStudioLlmPriorNodes(h.input);
    expect(result).toMatchObject({ kind: "completed", requested: ["c", "a", "b"], skipped: [], listRecord: "recorded" });
    expect(h.runMember.mock.calls.map(([request]) => request.original.callId)).toEqual(["c", "a", "b"]);
    for (const [index, [request]] of h.runMember.mock.calls.entries()) {
      expect(request.value).toEqual(h.registry.get(request.original.callId)?.input);
      expect(Object.isFrozen(request.original.input.parameters)).toBe(true);
      expect(Object.isFrozen(request.original.effectiveInputs)).toBe(true);
      expect(result.executed[index]).toMatchObject({ kind: "returned", callId: `actual.${index}`, result: actual[index] });
      const member = result.executed[index];
      if (member?.kind === "returned") expect(member.result).toBe(actual[index]);
    }
    expect([...h.registry.values()]).toEqual(before);
    expect(h.admitted).toHaveBeenCalledTimes(1);
    expect(h.recorded).toHaveBeenCalledTimes(1);
    expect(h.recorded.mock.calls[0]?.[0]).toBe(result.identity);
    expect(result).not.toHaveProperty("effectApplied");
    expect(result).not.toHaveProperty("evidence");
  });

  it("gives aliases and differently ordered keys one canonical identity, with order/version/world/authority still meaningful", async () => {
    const first = harness();
    first.registry.set("a", original("a", { definitionId: "spec.read", input: { node: "read-alias", parameters: { b: 2, a: 1 }, consequences: [] }, effectiveInputs: { payload: { b: 2, a: 1 } } }));
    first.input.value = { calls: ["a"] };
    const one = await runAutomationStudioLlmPriorNodes(first.input);
    const second = harness();
    second.registry.set("other", original("other", { definitionId: "spec.read", input: { parameters: { a: 1, b: 2 }, consequences: [], node: "another-alias" }, effectiveInputs: { payload: { a: 1, b: 2 } } }));
    second.input.value = { calls: ["other"] };
    second.input.world = { draft: "draft:1", place: "world:1" };
    const two = await runAutomationStudioLlmPriorNodes(second.input);
    expect(one.identity?.key).toBe(two.identity?.key);
    expect(one.identity?.key).not.toContain("read-alias");
    expect(two.identity?.key).not.toContain("other");
    expect(second.runMember.mock.calls[0]?.[0].value.node).toBe("spec.read");
    for (const change of ["version", "authority", "world"] as const) {
      const changed = harness();
      changed.input.value = { calls: ["a"] };
      changed.registry.set("a", original("a", {
        definitionId: "spec.read", input: { node: "read-alias", parameters: { a: 1, b: 2 }, consequences: [] },
        effectiveInputs: { payload: { a: 1, b: 2 } },
        definitionVersion: change === "version" ? "2.0.0" : "1.0.0",
        authorityKey: change === "authority" ? "registry:2:grants:1" : "registry:1:grants:1"
      }));
      if (change === "world") changed.input.world = { place: "world:2", draft: "draft:1" };
      expect((await runAutomationStudioLlmPriorNodes(changed.input)).identity?.key).not.toBe(one.identity?.key);
    }
    const ordered = harness();
    const forward = await runAutomationStudioLlmPriorNodes(ordered.input);
    ordered.input.value = { calls: ["c", "b", "a"] };
    expect((await runAutomationStudioLlmPriorNodes(ordered.input)).identity?.key).not.toBe(forward.identity?.key);
  });

  it("distinguishes actual effective inputs even when definition, parameters and authority match", async () => {
    const first = harness();
    first.input.value = { calls: ["a"] };
    first.registry.set("a", original("a", { effectiveInputs: { payload: { value: "first" } } }));
    const second = harness();
    second.input.value = { calls: ["a"] };
    second.registry.set("a", original("a", { effectiveInputs: { payload: { value: "second" } } }));
    const one = await runAutomationStudioLlmPriorNodes(first.input);
    const two = await runAutomationStudioLlmPriorNodes(second.input);
    expect(one.kind).toBe("completed");
    expect(two.kind).toBe("completed");
    expect(one.identity?.key).not.toBe(two.identity?.key);
    expect(first.runMember.mock.calls[0]?.[0].original.effectiveInputs).toEqual({ payload: { value: "first" } });
    expect(first.runMember.mock.calls[0]?.[0].value).not.toHaveProperty("effectiveInputs");
  });

  it("deeply freezes cloned actual inputs without freezing or retaining their mutable producer source", () => {
    const effectiveInputs: JsonObject = { payload: { value: "before", nested: [1, 2] } };
    const source = original("a", { effectiveInputs });
    const frozen = automationStudioLlmRunNodesOriginal(source, "a", "live-loop");
    expect(frozen?.effectiveInputs).toEqual({ payload: { value: "before", nested: [1, 2] } });
    const payload = effectiveInputs.payload as JsonObject;
    payload.value = "after";
    (payload.nested as number[]).push(3);
    expect(Object.isFrozen(effectiveInputs)).toBe(false);
    expect(Object.isFrozen(frozen?.effectiveInputs)).toBe(true);
    expect(Object.isFrozen(frozen?.effectiveInputs.payload)).toBe(true);
    expect(frozen?.effectiveInputs).toEqual({ payload: { value: "before", nested: [1, 2] } });
  });

  it("refuses missing effective-input provenance before dispatching any earlier member", async () => {
    const h = harness();
    const missing = original("c");
    delete (missing as Partial<AutomationStudioLlmRunNodesPriorCall>).effectiveInputs;
    h.registry.set("c", missing);
    expect(await runAutomationStudioLlmPriorNodes(h.input)).toMatchObject({ kind: "rejected", executed: [], stop: { index: 2, reason: "ineligible_original" } });
    expect(h.runMember).not.toHaveBeenCalled();
    expect(h.admitted).not.toHaveBeenCalled();
  });

  it.each<unknown>([undefined, null, [], { payload: undefined }])("refuses unreadable effective inputs rather than defaulting them to no inputs: %j", async (effectiveInputs) => {
    const h = harness();
    h.registry.set("c", { ...original("c"), effectiveInputs } as unknown as AutomationStudioLlmRunNodesPriorCall);
    expect(await runAutomationStudioLlmPriorNodes(h.input)).toMatchObject({ kind: "rejected", executed: [], stop: { index: 2, reason: "ineligible_original" } });
    expect(h.runMember).not.toHaveBeenCalled();
  });

  it.each([
    null, [], {}, { calls: [] }, { calls: "a" }, { calls: [1] }, { calls: [""] }, { calls: ["a "] },
    { calls: ["a"], parameters: {} }, { calls: ["a"], consequences: [] }, { calls: ["a"], safe: true },
    { calls: ["a"], write: true }, { calls: ["a"], add: true }, { calls: ["a"], from: 1 },
    { calls: ["a"], outputs: {} }, { calls: ["a"], callsAgain: [] }, { calls: new Array(2) },
    { calls: ["a"], effectiveInputs: {} }
  ])("rejects malformed or expanded model input before dispatch: %j", async (value) => {
    const h = harness();
    h.input.value = value;
    const result = await runAutomationStudioLlmPriorNodes(h.input);
    expect(result).toMatchObject({ kind: "rejected", executed: [], stop: { reason: "input_invalid" } });
    expect(h.runMember).not.toHaveBeenCalled();
    expect(h.admitted).not.toHaveBeenCalled();
  });

  it("rejects duplicate and unknown members anywhere in the entire list before dispatch", async () => {
    for (const [calls, reason] of [[ ["a", "b", "a"], "duplicate_call" ], [ ["a", "missing"], "unknown_call" ]] as const) {
      const h = harness();
      h.input.value = { calls };
      expect(await runAutomationStudioLlmPriorNodes(h.input)).toMatchObject({ kind: "rejected", executed: [], skipped: [...calls], stop: { reason } });
      expect(h.runMember).not.toHaveBeenCalled();
    }
  });

  it.each<Partial<AutomationStudioLlmRunNodesPriorCall>>([
    { execution: execution("spec.failed", { evidence: { ok: false } }) },
    { execution: execution("spec.read", { evidence: { values: [] } }) },
    { execution: { ok: true } },
    { execution: execution("spec.read", { personNeeded: true }) },
    { execution: execution("core.run_node.written") },
    { execution: execution("spec.read", { failure: { category: "action_failed", code: "spec.failed", retryable: true, effect: "unacted" } }) },
    { execution: execution("spec.read", { failure: { category: "ambiguous_or_unknown", code: "spec.unknown", retryable: false, effect: "ambiguous" } }) },
    { loopId: "previous-loop" },
    { callId: "different-call" },
    { definitionVersion: "" },
    { authorityKey: "" },
    { input: { node: "spec.read.c", parameters: {}, consequences: [], write: true } },
    { input: { node: "spec.read.c", parameters: {}, consequences: [], replay: "step" } },
    { input: { node: "spec.read.c", parameters: {}, consequences: [], item: { name: "rebound" } } },
    { input: { node: "spec.read.c", parameters: { item: { $row: "name" } }, consequences: [] } },
    { input: { node: "spec.read.c", parameters: { item: { $state: { path: "input" } } }, consequences: [] } }
  ])("refuses an ineligible final original without running the earlier originals: %j", async (over) => {
    const h = harness();
    h.registry.set("c", original("c", over));
    expect(await runAutomationStudioLlmPriorNodes(h.input)).toMatchObject({ kind: "rejected", executed: [], stop: { index: 2, reason: "ineligible_original" } });
    expect(h.runMember).not.toHaveBeenCalled();
  });

  it("does not accept flow runs or nested batch calls as run-node originals", async () => {
    for (const toolId of ["core.run_flow", "core.run_nodes"]) {
      const h = harness();
      h.registry.set("c", { ...original("c"), toolId } as unknown as AutomationStudioLlmRunNodesPriorCall);
      expect(await runAutomationStudioLlmPriorNodes(h.input)).toMatchObject({ kind: "rejected", executed: [] });
      expect(h.runMember).not.toHaveBeenCalled();
    }
  });

  it.each([0, 1, 2])("stops at final failed member %i and preserves its actual receipt", async (at) => {
    const h = harness();
    const failed = execution("spec.read", { evidence: { ok: false, code: "spec.no_match" } });
    h.runMember.mockImplementation(async ({ index }) => ({ callId: `actual.${index}`, result: index === at ? failed : execution() }));
    const result = await runAutomationStudioLlmPriorNodes(h.input);
    expect(result).toMatchObject({ kind: "stopped", stop: { index: at, reason: "failed_result" }, skipped: ["a", "b", "c"].slice(at + 1) });
    expect(h.runMember).toHaveBeenCalledTimes(at + 1);
    expect(result.executed).toHaveLength(at + 1);
    const stopped = result.executed[at];
    if (stopped?.kind === "returned") expect(stopped.result).toBe(failed);
    expect(h.recorded).toHaveBeenCalledTimes(1);
  });

  it.each([0, 1, 2])("stops at thrown member %i without a fabricated returned receipt", async (at) => {
    const h = harness();
    const error = new Error("ordinary runner failed");
    h.runMember.mockImplementation(async ({ index }) => {
      if (index === at) throw error;
      return { callId: `actual.${index}`, result: execution() };
    });
    const result = await runAutomationStudioLlmPriorNodes(h.input);
    expect(result).toMatchObject({ kind: "stopped", stop: { index: at, reason: "member_threw" }, skipped: ["a", "b", "c"].slice(at + 1) });
    expect(result.executed[at]).toEqual({ index: at, priorCallId: ["a", "b", "c"][at], kind: "threw", error });
    expect(result.executed[at]).not.toHaveProperty("result");
    expect(h.runMember).toHaveBeenCalledTimes(at + 1);
  });

  it.each([
    ["spec.other", "spec.read"], [undefined, "spec.read"], ["spec.read", undefined]
  ])("stops on changed or missing result codes (%s versus %s)", async (actualCode, originalCode) => {
    const h = harness();
    const baseline = execution();
    const actual = execution();
    if (originalCode === undefined) delete baseline.resultCode;
    else baseline.resultCode = originalCode;
    if (actualCode === undefined) delete actual.resultCode;
    else actual.resultCode = actualCode;
    h.registry.set("b", original("b", { execution: baseline }));
    h.runMember.mockImplementation(async ({ index }) => ({ callId: `actual.${index}`, result: index === 1 ? actual : execution() }));
    expect(await runAutomationStudioLlmPriorNodes(h.input)).toMatchObject({ kind: "stopped", stop: { index: 1, reason: "result_code_changed" }, skipped: ["c"] });
    expect(h.runMember).toHaveBeenCalledTimes(2);
  });

  it("compares an explicitly absent baseline code exactly, while still requiring a positive actual success receipt", async () => {
    const h = harness();
    const actual = execution();
    delete actual.resultCode;
    h.registry.set("a", original("a", { execution: actual }));
    h.input.value = { calls: ["a"] };
    h.runMember.mockResolvedValue({ callId: "actual.0", result: actual });
    expect(await runAutomationStudioLlmPriorNodes(h.input)).toMatchObject({ kind: "completed", executed: [{ result: actual }] });
  });

  it.each([
    [null, "invalid_result"],
    [{ ok: true }, "invalid_result"],
    [{ ...execution(), extra: true }, "invalid_result"],
    [{ ...execution(), failure: null }, "invalid_result"],
    [execution("spec.read", { personNeeded: true }), "person_needed"],
    [execution("spec.read", { failure: { category: "ambiguous_or_unknown", code: "spec.uncertain", retryable: false, effect: "ambiguous" } }), "uncertain_result"],
    [execution("spec.read", { failure: { category: "timeout", code: "spec.timeout", retryable: true, effect: "unacted" } }), "failed_result"],
    [execution("spec.read", { evidence: { values: [] } }), "failed_result"]
  ] as const)("stops on an unreadable/person-needed/uncertain actual result without retrying: %j", async (actual, reason) => {
    const h = harness();
    h.runMember.mockImplementation(async ({ index }) => ({ callId: `actual.${index}`, result: index === 1 ? actual : execution() }));
    const result = await runAutomationStudioLlmPriorNodes(h.input);
    expect(result).toMatchObject({ kind: "stopped", stop: { index: 1, reason }, skipped: ["c"] });
    const stopped = result.executed[1];
    if (stopped?.kind === "returned") expect(stopped.result).toBe(actual);
    expect(h.runMember).toHaveBeenCalledTimes(2);
  });

  it.each([
    COMMIT,
    { effectClass: "state", permissionConsequences: [] },
    { effectClass: "observe", permissionConsequences: ["send_or_publish"] },
    { effectClass: "commit", permissionConsequences: [], repeatSafe: true },
    { effectClass: "observe", permissionConsequences: [], safe: true },
    { effectClass: "unknown", permissionConsequences: [] },
    { effectClass: "state", permissionConsequences: [], repeatSafe: true, commitWhen: "commit" }
  ])("refuses unsafe/malformed trusted floors despite a model's safe-looking concrete parameters: %j", async (floor) => {
    const h = harness({ resolveRerunEffect: () => floor as AutomationStudioResolvedActionEffect });
    h.registry.set("c", original("c", { input: { node: "spec.read.c", parameters: { effect: "observe", repeatSafe: true, consequences: [] }, consequences: [] } }));
    expect(await runAutomationStudioLlmPriorNodes(h.input)).toMatchObject({ kind: "rejected", executed: [] });
    expect(h.runMember).not.toHaveBeenCalled();
  });

  it("requires trusted repeatSafe on temporary state and does not demand a model safety label", async () => {
    const h = harness({ resolveRerunEffect: () => STATE });
    for (const callId of ["a", "b", "c"]) h.registry.set(callId, original(callId, { actionEffect: STATE }));
    expect(await runAutomationStudioLlmPriorNodes(h.input)).toMatchObject({ kind: "completed", skipped: [] });
    expect(h.runMember).toHaveBeenCalledTimes(3);
  });

  it("keeps conditional commit resolution conservative and admits only a resolved false predicate", async () => {
    const resolve = (parameters: JsonObject) => resolveAutomationStudioNodeActionEffect({
      actionEffect: { effectClass: "state", permissionConsequences: [], repeatSafe: true, commitWhen: "commit" },
      parameters: [{ id: "commit", label: "Commit", valueType: "boolean", required: false }]
    }, parameters);
    const predicates: JsonObject[] = [{}, { commit: true }, { commit: { $state: { path: "later" } } }];
    for (const parameters of predicates) {
      const h = harness({ resolveRerunEffect: () => resolve(parameters) });
      expect(await runAutomationStudioLlmPriorNodes(h.input)).toMatchObject({ kind: "rejected", executed: [] });
      expect(h.runMember).not.toHaveBeenCalled();
    }
    const h = harness({ resolveRerunEffect: () => resolve({ commit: false }) });
    expect(await runAutomationStudioLlmPriorNodes(h.input)).toMatchObject({ kind: "completed" });
  });

  it("never lowers an original declared or observed lasting floor to a fresh observation floor", async () => {
    for (const over of [{ actionEffect: COMMIT }, { observedEffect: COMMIT }]) {
      const h = harness();
      h.registry.set("c", original("c", over));
      expect(await runAutomationStudioLlmPriorNodes(h.input)).toMatchObject({ kind: "rejected", executed: [] });
      expect(h.runMember).not.toHaveBeenCalled();
    }
    const h = harness({ resolveAuthority: (prior) => ({ definitionId: prior.definitionId, definitionVersion: prior.definitionVersion, authorityKey: prior.authorityKey, observedEffect: COMMIT }) });
    expect(await runAutomationStudioLlmPriorNodes(h.input)).toMatchObject({ kind: "rejected", stop: { reason: "unsafe_effect" }, executed: [] });
  });

  it("re-resolves safety between members and skips all later members after escalation", async () => {
    const h = harness();
    h.ports.resolveRerunEffect = (definitionId) => h.runMember.mock.calls.length > 0 && definitionId === "spec.read.b" ? COMMIT : OBSERVE;
    const result = await runAutomationStudioLlmPriorNodes(h.input);
    expect(result).toMatchObject({ kind: "stopped", executed: [{ priorCallId: "a" }], skipped: ["b", "c"], stop: { index: 1, reason: "unsafe_effect" } });
    expect(h.runMember).toHaveBeenCalledTimes(1);
  });

  it.each(["version", "authority", "input", "effectiveInputs", "original", "withdrawn"] as const)("refuses a changed %s after the first member", async (changed) => {
    const h = harness();
    h.runMember.mockImplementation(async ({ index }) => {
      if (index === 0) {
        const prior = h.registry.get("b")!;
        if (changed === "version") prior.definitionVersion = "2.0.0";
        if (changed === "authority") prior.authorityKey = "registry:1:grants:2";
        if (changed === "input") prior.input.parameters = { field: "different" };
        if (changed === "effectiveInputs") prior.effectiveInputs = { payload: "different" };
        if (changed === "original") prior.execution = execution("spec.changed");
        if (changed === "withdrawn") h.registry.delete("b");
      }
      return { callId: `actual.${index}`, result: execution() };
    });
    const result = await runAutomationStudioLlmPriorNodes(h.input);
    expect(result).toMatchObject({ kind: "stopped", skipped: ["b", "c"], stop: { index: 1 } });
    expect(h.runMember).toHaveBeenCalledTimes(1);
  });

  it("refuses revoked current authority, missing effect resolution, and unreadable provenance before any dispatch", async () => {
    const noAuthority = harness({ resolveAuthority: () => undefined });
    const noResolver = harness({ resolveRerunEffect: undefined });
    const thrownResolver = harness({ resolveRerunEffect: () => { throw new Error("floor unavailable"); } });
    const thrownLookup = harness({ lookupPriorCall: () => { throw new Error("provenance unavailable"); } });
    for (const [h, reason] of [[noAuthority, "authority_unavailable"], [noResolver, "effect_unavailable"], [thrownResolver, "effect_unavailable"], [thrownLookup, "provenance_unreadable"]] as const) {
      expect(await runAutomationStudioLlmPriorNodes(h.input)).toMatchObject({ kind: "rejected", executed: [], stop: { reason } });
      expect(h.runMember).not.toHaveBeenCalled();
    }
  });

  it("checks live grant authority again after an earlier member, even when original provenance is unchanged", async () => {
    const h = harness();
    h.ports.resolveAuthority = (prior) => ({
      definitionId: prior.definitionId,
      definitionVersion: prior.definitionVersion,
      authorityKey: h.runMember.mock.calls.length > 0 ? "registry:1:grants:2" : prior.authorityKey
    });
    expect(await runAutomationStudioLlmPriorNodes(h.input)).toMatchObject({ kind: "stopped", executed: [{ priorCallId: "a" }], skipped: ["b", "c"], stop: { index: 1, reason: "authority_changed" } });
    expect(h.runMember).toHaveBeenCalledTimes(1);
  });

  it("passes through the ordinary runner without retries, purse creation, binding or draft additions", async () => {
    const h = harness();
    const names = Object.keys(h.ports).sort();
    await runAutomationStudioLlmPriorNodes(h.input);
    expect(h.runMember.mock.calls).toHaveLength(3);
    expect(names).toEqual(["allowance", "listGuard", "lookupPriorCall", "resolveAuthority", "resolveRerunEffect", "runMember"]);
    for (const [request] of h.runMember.mock.calls) expect(Object.keys(request.value).sort()).toEqual(["consequences", "node", "parameters"]);
  });

  it("uses private actual-dispatch arguments even when draft ranWith restores a model-facing handle", async () => {
    const h = harness();
    h.input.value = { calls: ["a"] };
    h.registry.set("a", original("a", {
      input: { node: "spec.read.a", parameters: { target: { locator: "actual.refreshed" } }, consequences: [] },
      execution: execution("spec.read", { draft: { ranWith: { node: "spec.read.a", parameters: { target: { handle: "original.model.handle" } }, consequences: [] } } })
    }));
    expect(await runAutomationStudioLlmPriorNodes(h.input)).toMatchObject({ kind: "completed" });
    expect(h.runMember.mock.calls[0]?.[0].value.parameters).toEqual({ target: { locator: "actual.refreshed" } });
    expect(h.runMember.mock.calls[0]?.[0].value.parameters).not.toEqual({ target: { handle: "original.model.handle" } });
  });

  it.each(["tool_calls", "time", "purse", "unavailable", "cancelled"] as const)("stops when the existing %s allowance is exhausted after one actual member", async (reason) => {
    const h = harness();
    h.ports.allowance = () => h.runMember.mock.calls.length > 0 ? { allowed: false, reason } : { allowed: true };
    expect(await runAutomationStudioLlmPriorNodes(h.input)).toMatchObject({ kind: "stopped", skipped: ["b", "c"], stop: { index: 1, reason } });
    expect(h.runMember).toHaveBeenCalledTimes(1);
  });

  it("checks cancellation again after awaited authority and retains a call that actually completed while cancellation arrived", async () => {
    const controller = new AbortController();
    const h = harness();
    h.input.signal = controller.signal;
    h.runMember.mockImplementation(async ({ index, signal }) => {
      expect(signal).toBe(controller.signal);
      controller.abort();
      return { callId: `actual.${index}`, result: execution() };
    });
    expect(await runAutomationStudioLlmPriorNodes(h.input)).toMatchObject({ kind: "stopped", executed: [{ kind: "returned" }], skipped: ["b", "c"], stop: { index: 0, reason: "cancelled" } });
    expect(h.runMember).toHaveBeenCalledTimes(1);
    const already = harness();
    already.input.signal = controller.signal;
    expect(await runAutomationStudioLlmPriorNodes(already.input)).toMatchObject({ kind: "stopped", executed: [], skipped: ["a", "b", "c"], stop: { reason: "cancelled" } });
    expect(already.runMember).not.toHaveBeenCalled();
  });

  it("does not dispatch when a resolver awaiting member admission uses up the allowance", async () => {
    const h = harness();
    let resolutions = 0;
    h.ports.resolveRerunEffect = async () => {
      resolutions += 1;
      return OBSERVE;
    };
    h.ports.allowance = () => resolutions > 3 ? { allowed: false, reason: "time" } : { allowed: true };
    expect(await runAutomationStudioLlmPriorNodes(h.input)).toMatchObject({ kind: "stopped", executed: [], stop: { index: 0, reason: "time" } });
    expect(h.runMember).not.toHaveBeenCalled();
  });

  it("does not dispatch after awaited authority resolution cancels the loop", async () => {
    const controller = new AbortController();
    const h = harness();
    let resolutions = 0;
    h.input.signal = controller.signal;
    h.ports.resolveAuthority = async (prior) => {
      resolutions += 1;
      if (resolutions > 3) controller.abort();
      return { definitionId: prior.definitionId, definitionVersion: prior.definitionVersion, authorityKey: prior.authorityKey };
    };
    expect(await runAutomationStudioLlmPriorNodes(h.input)).toMatchObject({ kind: "stopped", executed: [], stop: { index: 0, reason: "cancelled" } });
    expect(h.runMember).not.toHaveBeenCalled();
  });

  it("fails closed if the existing allowance cannot be read", async () => {
    const h = harness({ allowance: () => { throw new Error("allowance unreadable"); } });
    expect(await runAutomationStudioLlmPriorNodes(h.input)).toMatchObject({ kind: "stopped", executed: [], stop: { reason: "allowance_unreadable" } });
    expect(h.runMember).not.toHaveBeenCalled();
  });

  it("checks a list only once against its original world, even when real members move that world", async () => {
    const h = harness();
    h.runMember.mockImplementation(async ({ index }) => {
      h.input.world.place = `world:${index + 2}`;
      return { callId: `actual.${index}`, result: execution() };
    });
    const result = await runAutomationStudioLlmPriorNodes(h.input);
    expect(result.identity?.input.world).toEqual({ place: "world:1", draft: "draft:1" });
    expect(h.admitted).toHaveBeenCalledTimes(1);
    expect(h.recorded.mock.calls[0]?.[0]).toBe(h.admitted.mock.calls[0]?.[0]);
  });

  it("honors list-guard refusal without turning the envelope into an extra action", async () => {
    const h = harness();
    h.admitted.mockReturnValue(false);
    expect(await runAutomationStudioLlmPriorNodes(h.input)).toMatchObject({ kind: "rejected", executed: [], skipped: ["a", "b", "c"], stop: { reason: "list_guard_refused" } });
    expect(h.runMember).not.toHaveBeenCalled();
    expect(h.recorded).not.toHaveBeenCalled();
  });

  it("refuses an unreadable list guard before dispatch", async () => {
    const h = harness();
    h.admitted.mockImplementation(() => { throw new Error("list guard unavailable"); });
    expect(await runAutomationStudioLlmPriorNodes(h.input)).toMatchObject({ kind: "rejected", executed: [], stop: { reason: "list_guard_unreadable" } });
    expect(h.runMember).not.toHaveBeenCalled();
    expect(h.recorded).not.toHaveBeenCalled();
  });

  it("retains every real receipt and reports a failed list record for the owning loop to stop", async () => {
    const h = harness();
    h.recorded.mockImplementation(() => { throw new Error("repeat record failed"); });
    const result = await runAutomationStudioLlmPriorNodes(h.input);
    expect(result).toMatchObject({ kind: "stopped", executed: [{ kind: "returned" }, { kind: "returned" }, { kind: "returned" }], skipped: [], listRecord: "failed", stop: { index: 3, reason: "list_guard_record_failed" } });
    expect(h.runMember).toHaveBeenCalledTimes(3);
  });
});
