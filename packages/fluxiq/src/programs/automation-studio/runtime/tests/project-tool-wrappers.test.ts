import { expect, it } from "vitest";
import type { AutomationStudioLlmEvidenceRuntimeBinding } from "../llm/harness-options/index.ts";
import { automationStudioHarnessOptionRegistry, resolveAutomationStudioFlowBootstrapPlanParameters } from "../llm/harness-options/index.ts";
import { automationStudioLlmEvidenceRuntimeBindingChecked } from "../llm/domain-instructions/index.ts";
import { automationStudioFlowBootstrapActionPermissions } from "../flow-bootstrap/index.ts";
import { AutomationStudioSiteResetLedger, type AutomationStudioSiteResetCalls } from "../flow-bootstrap/site-reset/index.ts";
import { automationStudioPersonNeededToolCalls, type AutomationStudioParkingPort } from "../parking/index.ts";
import { startAutomationStudioBuildRouting } from "../route-state/index.ts";
import { AutomationStudioBuildCancellation } from "../service/flow-bootstrap-commands/index.ts";
import { bindAutomationStudioObservedBuildTools } from "../build-execution/index.ts";
import { AutomationStudioSiteResetObservation } from "../flow-bootstrap/reset-observation/index.ts";
import { buildToolFixture } from "../build-execution/tools/tests/fixture.ts";
import { BuildToolTestHost } from "../build-execution/tools/tests/host.ts";
import type { ExecutionCallbackOutcome, ExecutionCallbackSettlement } from "../../../../runtime/execution-observation/index.ts";
import { OriginalExecutionPromiseReceipts } from "../../../../runtime/execution-observation/queue-completion/index.ts";
import { AuthoringExecutionScope } from "../../../../runtime/flow-authoring/execution/observation/index.ts";
import { AutomationStudioBuildToolFactories, AutomationStudioProjectBuildToolObservers, inheritAutomationStudioBuildToolRequest, invokeAutomationStudioBuildToolDelegate } from "../build-execution/tools/index.ts";
import type { AutomationStudioFlowBootstrapPlan } from "../flow-bootstrap/index.ts";
import type { AutomationStudioActionPermissionCheck } from "../action-permissions/index.ts";

type PlanRequest = Parameters<NonNullable<AutomationStudioLlmEvidenceRuntimeBinding["resolvePlanNodeParameters"]>>[0];
type PlanResolution = Awaited<ReturnType<typeof resolveAutomationStudioFlowBootstrapPlanParameters>>;
type PlanResolverResult = { status: "unchanged" } | { status: "needs_permission"; missing: string[]; requestId: string | null };

type Fixture = Awaited<ReturnType<typeof buildToolFixture>>;
type Request = Parameters<AutomationStudioLlmEvidenceRuntimeBinding["executeTool"]>[0];
type Result = Awaited<ReturnType<AutomationStudioLlmEvidenceRuntimeBinding["executeTool"]>>;

async function composed(f: Fixture, host: AutomationStudioLlmEvidenceRuntimeBinding, options: {
  siteReset?: AutomationStudioSiteResetCalls;
  ask?: AutomationStudioParkingPort;
  project?: boolean;
  derive?: Parameters<typeof automationStudioFlowBootstrapActionPermissions>[0]["deriveInstructed"];
} = {}) {
  const harness = automationStudioHarnessOptionRegistry({ binding: automationStudioLlmEvidenceRuntimeBindingChecked(host), nodeIds: ["example.action"] })
    .evidenceLoopBinding({ projectId: "project.isolated", flowId: "flow.actual" }, { scope: { kind: "domain", domainId: "example" }, allowSideEffectsWithoutPolicy: true });
  bindAutomationStudioObservedBuildTools(harness, f.observer);
  const cancellation = new AutomationStudioBuildCancellation();
  const permissions = automationStudioFlowBootstrapActionPermissions({
    executeTool: cancellation.tool(harness.executeTool), permittedConsequences: ["modify_existing"], instructionIds: [],
    ...(options.siteReset ? { siteReset: options.siteReset } : {}),
    ...(options.project ? { authoringMode: "project" } : {}),
    ...(options.derive ? { deriveInstructed: options.derive } : {})
  });
  const person = automationStudioPersonNeededToolCalls({
    executeTool: permissions.executeTool, tools: harness.tools, stage: "authoring", subject: "build", newAskId: () => "person.one",
    ...(options.ask ? { ask: { port: options.ask } } : {})
  });
  const routing = await startAutomationStudioBuildRouting({
    projectId: "project.isolated", flowId: "flow.actual", flowInputs: [], start: "first_look", pageless: ["core.run_node", "example.look"]
  });
  const loop = { ...harness, executeTool: routing.recording(person.executeTool) };
  bindAutomationStudioObservedBuildTools(loop, f.observer);
  return Object.assign(loop, { permissionRecords: () => permissions.declarations() });
}

it.each([false, true])("preserves actual permission copies, original raw receiver and one root per authored call (reset=%s)", async reset => {
  const host = new BuildToolTestHost();
  const ledger: AutomationStudioSiteResetCalls = {
    claim() { return { kind: "none" }; },
    target() { throw new Error("no undo target is requested"); },
    explored() {}
  };
  const f = await buildToolFixture(undefined, callbacks => {
    callbacks.manage({ receiver: host, callback: host.executeTool, contract: "managed_direct_effects", consumeCompletion: input => host.completion(input) });
    callbacks.manage({ receiver: ledger, callback: ledger.claim, contract: "no_direct_effects" });
    callbacks.manage({ receiver: ledger, callback: ledger.explored, contract: "no_direct_effects" });
  });
  host.beforeCall = () => {
    expect(AutomationStudioSiteResetObservation.of(host)).toBeUndefined();
    expect([...f.store.rows.values()].filter(row => row.row.sourceKey === "studio.build.callbacks" && !row.closed).length).toBeGreaterThanOrEqual(5);
  };
  const loop = await composed(f, host, reset ? { siteReset: ledger } : {});
  for (const parameter of ["one", "two"]) {
    const result = await loop.executeTool({ callId: parameter, toolId: "core.run_node", value: { node: "example.action", parameter, ...(reset ? { undoes: "original.act" } : {}) }, referenceNow: 42 });
    expect(result).toMatchObject({ evidence: { parameter } });
  }
  expect(host.calls).toBe(2);
  expect(host.requests.map(call => call.referenceNow)).toEqual([42, 42]);
  expect(host.requests.every(call => typeof call.permission === "function" && !("undoes" in call.value))).toBe(true);
  expect(JSON.stringify(host.requests)).not.toMatch(/observer|reservation|proof|series/u);
  expect(f.issued).toHaveLength(2);
  expect([...f.store.rows.values()].filter(row => row.row.sourceKey === "studio.build.tools")).toHaveLength(2);
  expect((await f.assembly.consumer.inspect(f.scope)).state).toBe("clear");
});

it.each(["throw", "forged"] as const)("keeps real raw %s history through every wrapper and refuses changed/reopened calls before second IO", async mode => {
  const host = new BuildToolTestHost();
  const original = new Error("original write then missing acknowledgement");
  if (mode === "throw") host.failure = original;
  else host.forged = true;
  const f = await buildToolFixture();
  const loop = await composed(f, host);
  const first = loop.executeTool({ callId: "first", toolId: "core.run_node", value: { node: "example.action" } });
  if (mode === "throw") await expect(first).rejects.toBe(original);
  else expect(await first).toMatchObject({ resultCode: "synthetic.unacted" });
  await expect(loop.executeTool({ callId: "changed", toolId: "core.run_node", value: { node: "example.action", parameter: "changed" } })).rejects.toThrow();
  const reopened = await buildToolFixture(f.store);
  const again = await composed(reopened, host);
  await expect(again.executeTool({ callId: "reopened", toolId: "core.run_node", value: { node: "example.action" } })).rejects.toThrow();
  expect(host.calls).toBe(1);
  expect((await reopened.assembly.consumer.inspect(reopened.scope)).state).toBe("pending");
});

class PermissionHost implements AutomationStudioLlmEvidenceRuntimeBinding {
  readonly domainId = "example";
  readonly deniedEvidenceKeys = [];
  readonly runsNodes = {};
  readonly tools = [{ toolId: "example.look", description: "Look.", inputSchema: { type: "object" }, effect: "observe" as const, initialObservation: { input: {} } }];
  readonly requests: Request[] = [];
  private readonly receipts = new WeakMap<object, Result>();
  writes = 0;
  needsPerson = false;
  requirePermission = false;
  beforePermission: ((call: Request) => void | Promise<void>) | undefined;
  afterPermission: ((call: Request) => void | Promise<void>) | undefined;

  executeTool(call: Request): Promise<Result> {
    this.requests.push(call);
    const returned = this.run(call).then(value => {
      this.receipts.set(returned, value);
      return value;
    });
    return returned;
  }

  private async run(call: Request): Promise<Result> {
    if (this.requirePermission) {
      await this.beforePermission?.(call);
      const verdict = await call.permission({
        effect: "mutate", consequences: ["modify_existing"], verb: "press",
        control: { name: "Star", kind: "button", subject: "s:card", resource: "r:card", place: "pl:star", state: "st:off" }
      });
      await this.afterPermission?.(call);
      if (!verdict.permitted) return { kind: "llm_evidence_tool_execution", evidence: { refused: true }, effectApplied: false };
    }
    this.writes += 1;
    return {
      kind: "llm_evidence_tool_execution", evidence: { reading: this.writes }, effectApplied: call.toolId !== "example.look",
      ...(this.needsPerson && this.writes === 1 ? { personNeeded: true } : {})
    };
  }

  completion(input: { outcome: ExecutionCallbackOutcome<Result>; returned?: Promise<Result> | undefined }): ExecutionCallbackSettlement | null {
    const actual = input.returned && this.receipts.get(input.returned);
    return actual && input.outcome.kind === "fulfilled" && input.outcome.value === actual
      ? { disposition: "settled", completionDigest: "test.actual.callback.finished", assessmentDigest: "test.actual.callback.quiescent" }
      : null;
  }
}

it("observes real Core ledger permission callbacks during an active raw backend without treating them as a backend retry", async () => {
  const host = new PermissionHost();
  host.requirePermission = true;
  const ledger = new AutomationStudioSiteResetLedger({ owner: "builder" });
  const f = await buildToolFixture(undefined, callbacks => callbacks.manage({ receiver: host, callback: host.executeTool, contract: "managed_direct_effects", consumeCompletion: input => host.completion(input) }));
  let rawEntry: string | undefined;
  let earlier = new Set<string>();
  host.beforePermission = call => {
    expect(AuthoringExecutionScope.of(host)).toBeUndefined();
    const context = f.observer.callbackContext(call);
    if (!context) throw new Error("test.actual_raw_parent_required");
    rawEntry = f.assembly.entryBridge.read(context.parent.parent).row.entryId;
    earlier = new Set(f.store.rows.keys());
  };
  host.afterPermission = () => {
    const added = [...f.store.rows.values()].filter(value => !earlier.has(value.row.entryId));
    expect(added.length).toBeGreaterThan(0);
    expect(added.every(value => {
      let parent = value.row.parentId;
      while (parent && parent !== rawEntry) parent = f.store.rows.get(parent)?.row.parentId;
      return parent === rawEntry;
    })).toBe(true);
    expect(AuthoringExecutionScope.of(host)).toBeUndefined();
  };
  const loop = await composed(f, host, { siteReset: ledger, project: true });
  expect(await loop.executeTool({ callId: "press", toolId: "core.run_node", value: { node: "example.action" } })).toMatchObject({ effectApplied: true });
  expect(host.writes).toBe(1);
  expect(ledger.actOf("press")).toBe("act-1");
  expect(ledger.exploredActs()).toMatchObject([{ id: "act-1", consequences: ["modify_existing"], operation: "example.action", witnessed: false }]);
  expect(loop.permissionRecords()).toMatchObject([{ action: { ref: "press", effect: "mutate" }, consequences: ["modify_existing"], permitted: true }]);
  expect(f.issued).toHaveLength(1);
  expect((await f.assembly.consumer.inspect(f.scope)).state).toBe("clear");
});

it("separates concurrent original permission callbacks on the same raw receiver across cohorts", async () => {
  const host = new PermissionHost();
  host.requirePermission = true;
  const configure = (callbacks: Fixture["callbacks"]) => callbacks.manage({ receiver: host, callback: host.executeTool, contract: "managed_direct_effects", consumeCompletion: input => host.completion(input) });
  const first = await buildToolFixture(undefined, configure);
  const second = await buildToolFixture(undefined, configure);
  const one = await composed(first, host, { project: true, siteReset: new AutomationStudioSiteResetLedger({ owner: "builder.one" }) });
  const two = await composed(second, host, { project: true, siteReset: new AutomationStudioSiteResetLedger({ owner: "builder.two" }) });
  let release!: () => void;
  let reached!: () => void;
  const hold = new Promise<void>(resolve => { release = resolve; });
  const ready = new Promise<void>(resolve => { reached = resolve; });
  let entered = 0;
  host.beforePermission = async () => {
    entered++;
    if (entered === 2) reached();
    await hold;
    expect(AuthoringExecutionScope.of(host)).toBeUndefined();
  };
  const running = Promise.all([
    one.executeTool({ callId: "one", toolId: "core.run_node", value: { node: "example.action" } }),
    two.executeTool({ callId: "two", toolId: "core.run_node", value: { node: "example.action" } })
  ]);
  await Promise.race([ready, running.then(() => { throw new Error("test.calls_finished_before_permissions"); })]);
  expect(host.writes).toBe(0);
  expect(host.requests[0]!.permission).not.toBe(host.requests[1]!.permission);
  release();
  await expect(running).resolves.toMatchObject([{ effectApplied: true }, { effectApplied: true }]);
  expect(host.writes).toBe(2);
  expect((await first.assembly.consumer.inspect(first.scope)).state).toBe("clear");
  expect((await second.assembly.consumer.inspect(second.scope)).state).toBe("clear");
});

it("refuses a retained raw permission after its child retires while the outer Core frame remains open", async () => {
  const host = new PermissionHost();
  host.requirePermission = true;
  let baselines = 0;
  let lateRefused = false;
  let rawEntry: string | undefined;
  const completed = new WeakSet<Promise<void>>();
  const explored = (): Promise<void> => {
    const original = Promise.resolve().then(async () => {
      const call = host.requests[0];
      if (!call) throw new Error("test.actual_raw_request_required");
      const raw = rawEntry ? f.store.rows.get(rawEntry) : undefined;
      expect(raw?.closed).toBe(true);
      let ancestor = raw?.row.parentId;
      let openAncestor = false;
      while (ancestor) {
        const row = f.store.rows.get(ancestor);
        if (row && !row.closed) openAncestor = true;
        ancestor = row?.row.parentId;
      }
      expect(openAncestor).toBe(true);
      await expect(call.permission({ effect: "mutate", consequences: ["modify_existing"], verb: "press", control: { name: "Star", kind: "button" } })).rejects.toThrow("execution_observation.raw_permission_scope_required");
      lateRefused = true;
      completed.add(original);
    });
    return original;
  };
  const ledger: AutomationStudioSiteResetCalls = {
    claim() { return { kind: "none" }; },
    target() { throw new Error("no undo is requested"); },
    createBaseline() {
      baselines++;
      return { kind: "admit" };
    },
    explored
  };
  const f = await buildToolFixture(undefined, callbacks => {
    callbacks.manage({ receiver: host, callback: host.executeTool, contract: "managed_direct_effects", consumeCompletion: input => host.completion(input) });
    callbacks.manage({ receiver: ledger, callback: ledger.claim, contract: "no_direct_effects" });
    if (ledger.createBaseline) callbacks.manage({ receiver: ledger, callback: ledger.createBaseline, contract: "no_direct_effects" });
    callbacks.manage({ receiver: ledger, callback: explored, contract: "managed_direct_effects", consumeCompletion: input => input.returned instanceof Promise && completed.delete(input.returned) && input.outcome.kind === "fulfilled"
      ? { disposition: "settled", completionDigest: "test.late_permission.refused", assessmentDigest: "test.original_explored.finished" } : null });
  });
  host.beforePermission = call => {
    const current = f.observer.callbackContext(call);
    if (!current) throw new Error("test.actual_raw_parent_required");
    rawEntry = f.assembly.entryBridge.read(current.parent.parent).row.entryId;
  };
  const loop = await composed(f, host, { project: true, siteReset: ledger });
  await expect(loop.executeTool({ callId: "one", toolId: "core.run_node", value: { node: "example.action" } })).resolves.toMatchObject({ effectApplied: true });
  expect(lateRefused).toBe(true);
  expect(baselines).toBe(1);
  expect(host.writes).toBe(1);
  expect((await f.assembly.consumer.inspect(f.scope)).state).toBe("clear");
});

it("rejects a changed permission on an authentic request copy before invoking the raw actor", async () => {
  const host = new PermissionHost();
  host.requirePermission = true;
  let substitutions = 0;
  const replaced: AutomationStudioLlmEvidenceRuntimeBinding = {
    domainId: host.domainId, deniedEvidenceKeys: host.deniedEvidenceKeys, runsNodes: host.runsNodes, tools: host.tools,
    executeTool(call) {
      const copied = { ...call, permission: async () => {
        substitutions++;
        return { permitted: true as const };
      } };
      inheritAutomationStudioBuildToolRequest(call, copied);
      return invokeAutomationStudioBuildToolDelegate(copied, { receiver: host, callback: host.executeTool, args: [copied] });
    }
  };
  AutomationStudioBuildToolFactories.remember(replaced.executeTool, "frame");
  const f = await buildToolFixture();
  const loop = await composed(f, replaced);
  await expect(loop.executeTool({ callId: "changed", toolId: "core.run_node", value: { node: "example.action" } })).rejects.toThrow("execution_observation.foreign_raw_permission");
  expect(substitutions).toBe(0);
  expect(host.requests).toEqual([]);
  expect(host.writes).toBe(0);
});

it.each(["throw", "forged"] as const)("observes an injected ledger callback's actual %s outcome rather than trusting its Core wrapper", async mode => {
  const host = new BuildToolTestHost();
  const original = new Error("ledger callback wrote then threw");
  let writes = 0;
  const ledger: AutomationStudioSiteResetCalls = {
    claim() { return { kind: "none" }; },
    target() { throw new Error("no undo target is requested"); },
    explored() {
      writes += 1;
      if (mode === "throw") throw original;
    }
  };
  const f = await buildToolFixture(undefined, callbacks => callbacks.manage({ receiver: host, callback: host.executeTool, contract: "managed_direct_effects", consumeCompletion: input => host.completion(input) }));
  const loop = await composed(f, host, { siteReset: ledger });
  const first = loop.executeTool({ callId: "first", toolId: "core.run_node", value: { node: "example.action" } });
  if (mode === "throw") await expect(first).rejects.toBe(original);
  else expect(await first).toMatchObject({ effectApplied: true });
  const reopened = await buildToolFixture(f.store);
  const again = await composed(reopened, host, { siteReset: ledger });
  await expect(again.executeTool({ callId: "again", toolId: "core.run_node", value: { node: "example.action" } })).rejects.toThrow();
  expect(host.calls).toBe(1);
  expect(writes).toBe(1);
  expect((await reopened.assembly.consumer.inspect(reopened.scope)).state).toBe("pending");
});

it("keeps the person-cleared look under the original root and refuses an unsupported triggering callback before asking or looking", async () => {
  const host = new PermissionHost();
  host.needsPerson = true;
  let asks = 0;
  const port: AutomationStudioParkingPort = {
    open() { asks += 1; },
    async awaitAnswer(ask) { return { askId: ask.askId, kind: "choice", value: "person_done", answeredAt: 1, actorId: "person" }; }
  };
  const f = await buildToolFixture(undefined, callbacks => {
    callbacks.manage({ receiver: host, callback: host.executeTool, contract: "managed_direct_effects", consumeCompletion: input => host.completion(input) });
    callbacks.manage({ receiver: port, callback: port.open, contract: "no_direct_effects" });
    if (port.awaitAnswer) callbacks.manage({ receiver: port, callback: port.awaitAnswer, contract: "no_direct_effects" });
  });
  const loop = await composed(f, host, { ask: port });
  expect(await loop.executeTool({ callId: "check", toolId: "core.run_node", value: { node: "example.action" } })).toMatchObject({ evidence: { personCompletedCheck: true } });
  expect(host.requests.map(call => call.callId)).toEqual(["check", "check.look"]);
  expect(host.writes).toBe(2);
  expect(asks).toBe(1);
  expect(f.issued).toHaveLength(1);
  expect([...f.store.rows.values()].filter(row => row.row.sourceKey === "studio.build.tools")).toHaveLength(1);
  expect((await f.assembly.consumer.inspect(f.scope)).state).toBe("clear");

  const unsupported = new PermissionHost();
  unsupported.needsPerson = true;
  const unknown = await buildToolFixture();
  const unverified = await composed(unknown, unsupported, { ask: port });
  await expect(unverified.executeTool({ callId: "unsupported", toolId: "core.run_node", value: { node: "example.action" } })).rejects.toThrow("execution_observation.unverified_backend_retry");
  expect(unsupported.writes).toBe(1);
  expect(unsupported.requests).toHaveLength(1);
  expect(asks).toBe(1);
});

it("does not clear an original unadapted counter-writing parking port or invoke it again after reopen", async () => {
  const host = new PermissionHost();
  host.needsPerson = true;
  let writes = 0;
  let answers = 0;
  const port: AutomationStudioParkingPort = {
    open() { writes += 1; },
    async awaitAnswer(ask) {
      answers += 1;
      return { askId: ask.askId, kind: "choice", value: "person_done", answeredAt: 1, actorId: "person" };
    }
  };
  const f = await buildToolFixture(undefined, callbacks => callbacks.manage({ receiver: host, callback: host.executeTool, contract: "managed_direct_effects", consumeCompletion: input => host.completion(input) }));
  const loop = await composed(f, host, { ask: port });
  await expect(loop.executeTool({ callId: "first", toolId: "core.run_node", value: { node: "example.action" } })).rejects.toThrow();
  const reopened = await buildToolFixture(f.store);
  const again = await composed(reopened, host, { ask: port });
  await expect(again.executeTool({ callId: "again", toolId: "core.run_node", value: { node: "example.action" } })).rejects.toThrow();
  expect(host.writes).toBe(1);
  expect(host.requests).toHaveLength(1);
  expect(writes).toBe(1);
  expect(answers).toBe(0);
  expect((await reopened.assembly.consumer.inspect(reopened.scope)).state).toBe("pending");
});

class PlanPermissionResolver {
  readonly receipts = new OriginalExecutionPromiseReceipts();
  readonly consume = this.receipts.consume.bind(this.receipts);
  calls = 0;
  consequence: "modify_existing" | "delete" = "modify_existing";
  retained: AutomationStudioActionPermissionCheck | undefined;
  mode: "owned" | "forged" | "throw" = "owned";
  readonly failure = new Error("original resolver wrote then lost acknowledgement");

  resolvePlanNodeParameters(input: PlanRequest) {
    expect(AuthoringExecutionScope.of(this)).toBeUndefined();
    const scope = AuthoringExecutionScope.of(input);
    if (!scope) throw new Error("test.actual_plan_carrier_required");
    this.calls += 1;
    this.retained = input.permission;
    const original: Promise<PlanResolverResult> = Promise.resolve().then(async () => {
      if (this.mode === "throw") throw this.failure;
      if (this.mode === "forged") return { status: "unchanged" as const };
      const verdict = await input.permission({ effect: "mutate", consequences: [this.consequence], verb: "press", control: { name: this.consequence === "delete" ? "Remove" : "Keep", kind: "button", place: "c:keep", state: "s:off", scope: "p:one" } });
      const result = verdict.permitted ? { status: "unchanged" as const } : { status: "needs_permission" as const, missing: [...verdict.missing], requestId: verdict.requestId };
      this.receipts.issue(original, scope.context.callbacks, scope.context.parent, { disposition: "settled", completionDigest: "test.plan.original_permission.completed", assessmentDigest: "test.plan.owned_projection.finished" });
      return result;
    });
    return original;
  }
}

class PlanWitnessOwner implements AutomationStudioSiteResetCalls {
  readonly receipts = new OriginalExecutionPromiseReceipts();
  readonly consume = this.receipts.consume.bind(this.receipts);
  calls = 0;
  hold: Promise<void> = Promise.resolve();
  entered: (() => void) | undefined;
  claim(): { kind: "none" } { return { kind: "none" }; }
  target(): never { throw new Error("no exploration target is requested"); }
  explored(): void {}

  admitStep() {
    const scope = AuthoringExecutionScope.of(this);
    if (!scope) throw new Error("test.actual_step_parent_required");
    this.calls += 1;
    this.entered?.();
    const original: Promise<{ via: "control" }> = this.hold.then(() => {
      this.receipts.issue(original, scope.context.callbacks, scope.context.parent, { disposition: "settled", completionDigest: "test.plan.owned_witness.ack", assessmentDigest: "test.plan.owned_witness.finished" });
      return { via: "control" as const };
    });
    return original;
  }
}

function planPermissionLoop(f: Fixture, binding: PlanPermissionResolver, options: { witness?: PlanWitnessOwner; permitted?: boolean; ask?: AutomationStudioParkingPort; timeoutMs?: number } = {}) {
  const permissions = automationStudioFlowBootstrapActionPermissions({
    permittedConsequences: options.permitted === false ? [] : [binding.consequence], instructionIds: [], executeTool: async () => ({}),
    ...(options.witness ? { siteReset: options.witness } : {}),
    ...(options.ask ? { ask: { port: options.ask, ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }) } } : {})
  });
  const plan: AutomationStudioFlowBootstrapPlan = { schemaVersion: "0.1", router: { name: "Keep", rules: [], fallback: { kind: "subflow", targetSubflowKey: "main" } }, subflows: [
    { key: "main", name: "Main", role: "primary", nodes: [{ key: "keep", definitionId: "example.keep", definitionVersion: "1.0.0", parameters: {}, consequences: [binding.consequence] }], edges: [] }
  ] };
  const results: PlanResolution[] = [];
  const executeTool: ReturnType<typeof automationStudioFlowBootstrapActionPermissions>["executeTool"] = async call => {
    const resolved = await resolveAutomationStudioFlowBootstrapPlanParameters({ plan, projectId: "project.isolated", flowId: "flow.actual", handlesIssued: false, binding, permissionFor: permissions.planStep, originalInvocation: call });
    results.push(resolved);
    return { kind: "llm_evidence_tool_execution", evidence: { ok: resolved.ok }, effectApplied: false };
  };
  AutomationStudioBuildToolFactories.remember(executeTool, "frame");
  const loop = { executeTool };
  bindAutomationStudioObservedBuildTools(loop, f.observer);
  return { loop, permissions, results, plan };
}

it("holds actual plan permission at the original witness acknowledgement and carries its stamp without scoping the raw host", async () => {
  const owner = new PlanPermissionResolver();
  const witness = new PlanWitnessOwner();
  let release!: () => void;
  let entered!: () => void;
  witness.hold = new Promise<void>(resolve => { release = resolve; });
  const ready = new Promise<void>(resolve => { entered = resolve; });
  witness.entered = entered;
  const f = await buildToolFixture(undefined, callbacks => {
    callbacks.manage({ receiver: owner, callback: owner.resolvePlanNodeParameters, contract: "managed_direct_effects", consumeCompletion: owner.consume });
    callbacks.manage({ receiver: witness, callback: witness.admitStep, contract: "managed_direct_effects", consumeCompletion: witness.consume });
  });
  const h = planPermissionLoop(f, owner, { witness });
  let returned = false;
  const running = h.loop.executeTool({ callId: "submit", toolId: "core.submit_candidate", value: {} }).then(value => {
    returned = true;
    return value;
  });
  await Promise.race([ready, running.then(() => { throw new Error("plan returned before the held witness"); })]);
  expect(witness.calls).toBe(1);
  expect(returned).toBe(false);
  expect(h.results).toEqual([]);
  expect((await f.assembly.consumer.inspect(f.scope)).state).toBe("pending");
  release();
  await expect(running).resolves.toMatchObject({ evidence: { ok: true } });
  expect(h.results[0]).toMatchObject({ ok: true, plan: { subflows: [{ nodes: [{ resetWitness: { via: "control" } }] }] } });
  expect(h.plan.subflows[0]!.nodes[0]).not.toHaveProperty("resetWitness");
  expect((await f.assembly.consumer.inspect(f.scope)).state).toBe("clear");
  await h.loop.executeTool({ callId: "next-authored-submit", toolId: "core.submit_candidate", value: {} });
  expect(owner.calls).toBe(2);
  expect(witness.calls).toBe(2);
  expect(f.issued).toHaveLength(2);
  expect(JSON.stringify(h.results)).not.toMatch(/originalInvocation|observer|reservation|proof|series/u);
});

it.each(["forged", "throw"] as const)("keeps an actual %s plan resolver outcome unverified and blocks retry/reopen before a second original invocation", async mode => {
  const owner = new PlanPermissionResolver();
  owner.mode = mode;
  const f = await buildToolFixture();
  const h = planPermissionLoop(f, owner);
  await h.loop.executeTool({ callId: "first-submit", toolId: "core.submit_candidate", value: {} });
  if (mode === "forged") expect(h.results[0]).toMatchObject({ ok: true });
  else expect(h.results[0]).toMatchObject({ ok: false, issues: [{ code: "bootstrap.parameter_resolution_failed" }] });
  expect(owner.calls).toBe(1);
  await expect(h.loop.executeTool({ callId: "changed-submit", toolId: "core.submit_candidate", value: {} })).rejects.toThrow();
  const reopened = await buildToolFixture(f.store);
  const again = planPermissionLoop(reopened, owner);
  await expect(again.loop.executeTool({ callId: "reopened-submit", toolId: "core.submit_candidate", value: {} })).rejects.toThrow();
  expect(owner.calls).toBe(1);
  expect((await reopened.assembly.consumer.inspect(reopened.scope)).state).toBe("pending");
});

it("preserves real plan permission refusal without admitting a witness or treating the resolver as read-only", async () => {
  const owner = new PlanPermissionResolver();
  owner.consequence = "delete";
  const witness = new PlanWitnessOwner();
  const f = await buildToolFixture(undefined, callbacks => callbacks.manage({ receiver: owner, callback: owner.resolvePlanNodeParameters, contract: "managed_direct_effects", consumeCompletion: owner.consume }));
  const h = planPermissionLoop(f, owner, { witness, permitted: false });
  await h.loop.executeTool({ callId: "refused-submit", toolId: "core.submit_candidate", value: {} });
  expect(h.results[0]).toMatchObject({ ok: false, issues: [{ code: "bootstrap.step_permission_required" }] });
  expect(h.permissions.signal.aborted).toBe(true);
  expect(h.permissions.request()?.missing).toEqual(["delete"]);
  expect(witness.calls).toBe(0);
  expect(owner.calls).toBe(1);
  expect(f.callbacks.isReadOnly({ receiver: owner, callback: owner.resolvePlanNodeParameters })).toBe(false);
  expect((await f.assembly.consumer.inspect(f.scope)).state).toBe("clear");
});

it("observes the actual plan parking write and refuses answer/reopen IO after its unsupported fulfillment", async () => {
  const owner = new PlanPermissionResolver();
  owner.consequence = "delete";
  let opened = 0;
  let answered = 0;
  const port: AutomationStudioParkingPort = {
    open() { opened += 1; },
    async awaitAnswer(ask) {
      answered += 1;
      return { askId: ask.askId, kind: "grant", value: null, answeredAt: 1, actorId: null };
    }
  };
  const f = await buildToolFixture(undefined, callbacks => callbacks.manage({ receiver: owner, callback: owner.resolvePlanNodeParameters, contract: "managed_direct_effects", consumeCompletion: owner.consume }));
  const h = planPermissionLoop(f, owner, { permitted: false, ask: port });
  await h.loop.executeTool({ callId: "first-ask", toolId: "core.submit_candidate", value: {} });
  expect(h.results[0]).toMatchObject({ ok: false });
  const reopened = await buildToolFixture(f.store);
  const again = planPermissionLoop(reopened, owner, { permitted: false, ask: port });
  await expect(again.loop.executeTool({ callId: "reopened-ask", toolId: "core.submit_candidate", value: {} })).rejects.toThrow();
  expect(opened).toBe(1);
  expect(answered).toBe(0);
  expect(owner.calls).toBe(1);
});

it("allows actual plan permission only after the original question writer acknowledges its own completed work", async () => {
  const owner = new PlanPermissionResolver();
  owner.consequence = "delete";
  const acknowledged = new WeakSet<Promise<void>>();
  let opened = 0;
  let answered = 0;
  const port: AutomationStudioParkingPort = {
    open() {
      const original = Promise.resolve().then(() => {
        opened += 1;
        acknowledged.add(original);
      });
      return original;
    },
    async awaitAnswer(ask) {
      answered += 1;
      return { askId: ask.askId, kind: "grant", value: null, answeredAt: 1, actorId: null };
    }
  };
  const wait = port.awaitAnswer;
  if (!wait) throw new Error("test.actual_wait_required");
  const f = await buildToolFixture(undefined, callbacks => {
    callbacks.manage({ receiver: owner, callback: owner.resolvePlanNodeParameters, contract: "managed_direct_effects", consumeCompletion: owner.consume });
    callbacks.manage({ receiver: port, callback: port.open, contract: "managed_direct_effects", consumeCompletion: input => {
      if (!(input.returned instanceof Promise) || !acknowledged.delete(input.returned) || input.outcome.kind !== "fulfilled" || input.outcome.value !== undefined) return null;
      return { disposition: "settled", completionDigest: "test.actual.question_writer.ack", assessmentDigest: "test.actual.question_writer.finished" };
    } });
    callbacks.manage({ receiver: port, callback: wait, contract: "no_direct_effects" });
  });
  const h = planPermissionLoop(f, owner, { permitted: false, ask: port, timeoutMs: 100 });
  await expect(h.loop.executeTool({ callId: "granted-ask", toolId: "core.submit_candidate", value: {} })).resolves.toMatchObject({ evidence: { ok: true } });
  expect(opened).toBe(1);
  expect(answered).toBe(1);
  expect(h.permissions.signal.aborted).toBe(false);
  expect(h.results[0]).toMatchObject({ ok: true });
  expect((await f.assembly.consumer.inspect(f.scope)).state).toBe("clear");
});

it("denies an actual retained permission callback after its observed resolver frame ended", async () => {
  const owner = new PlanPermissionResolver();
  owner.mode = "forged";
  owner.consequence = "delete";
  let writes = 0;
  const port: AutomationStudioParkingPort = { open: () => { writes += 1; } };
  const f = await buildToolFixture();
  const h = planPermissionLoop(f, owner, { permitted: false, ask: port });
  await h.loop.executeTool({ callId: "retained", toolId: "core.submit_candidate", value: {} });
  const retained = owner.retained;
  if (!retained) throw new Error("test.actual_permission_callback_required");
  await expect(retained({ effect: "mutate", consequences: ["delete"], verb: "press", control: { name: "Remove", kind: "button" } })).rejects.toThrow("execution_observation.plan_scope_required");
  expect(writes).toBe(0);
  expect(owner.calls).toBe(1);
  expect(h.permissions.declarations()).toEqual([]);
  expect((await f.assembly.consumer.inspect(f.scope)).state).toBe("pending");
});

it("retains the original permission callback behavior for a genuinely unobserved resolver", async () => {
  let retained: AutomationStudioActionPermissionCheck | undefined;
  let writes = 0;
  const permissions = automationStudioFlowBootstrapActionPermissions({ permittedConsequences: [], instructionIds: [], executeTool: async () => ({}), ask: { timeoutMs: 100, port: {
    open: () => { writes += 1; },
    awaitAnswer: async ask => ({ askId: ask.askId, kind: "grant", value: null, answeredAt: 1, actorId: null })
  } } });
  const plan: AutomationStudioFlowBootstrapPlan = { schemaVersion: "0.1", router: { name: "Remove", rules: [], fallback: { kind: "subflow", targetSubflowKey: "main" } }, subflows: [
    { key: "main", name: "Main", role: "primary", nodes: [{ key: "remove", definitionId: "example.remove", definitionVersion: "1.0.0", parameters: {}, consequences: ["delete"] }], edges: [] }
  ] };
  await resolveAutomationStudioFlowBootstrapPlanParameters({ plan, projectId: "project.legacy", flowId: "flow.legacy", handlesIssued: false, permissionFor: permissions.planStep, binding: {
    resolvePlanNodeParameters(input) {
      retained = input.permission;
      return { status: "unchanged" };
    }
  } });
  if (!retained) throw new Error("test.actual_permission_callback_required");
  await expect(retained({ effect: "mutate", consequences: ["delete"], verb: "press", control: { name: "Remove", kind: "button" } })).resolves.toEqual({ permitted: true });
  expect(writes).toBe(1);
});

it("rejects copied or foreign Core carriers before invoking the original backend", async () => {
  const host = new BuildToolTestHost();
  const first = await buildToolFixture();
  const foreign = await buildToolFixture();
  const carrier = {};
  AutomationStudioProjectBuildToolObservers.bind(carrier, foreign.observer);
  await expect(first.observer.invoke({ receiver: host, callback: host.executeTool, args: [{ callId: "foreign", toolId: "core.run_node", value: {}, projectId: "project.isolated", flowId: "flow.actual", permission: async () => ({ permitted: true as const }) }] }, carrier, undefined, carrier)).rejects.toThrow("foreign_core_carrier");
  await expect(first.observer.invoke({ receiver: host, callback: host.executeTool, args: [{ callId: "copied", toolId: "core.run_node", value: {}, projectId: "project.isolated", flowId: "flow.actual", permission: async () => ({ permitted: true as const }) }] }, {}, undefined, { ...carrier })).rejects.toThrow("foreign_core_carrier");
  expect(host.calls).toBe(0);
  expect(first.issued).toEqual([]);
});
