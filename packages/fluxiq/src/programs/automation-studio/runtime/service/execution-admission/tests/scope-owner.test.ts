// @fluxiq-test-group real-sql
import { expect, it, vi } from "vitest";
import type { ExecutionScopeAttestation, ExecutionScopeAttestor, ExecutionScopeBinding, ExecutionScopeOwner } from "../../../../../../runtime/execution-admission/index.ts";
import { AdmissionTestSource } from "../../../../../../runtime/execution-admission/tests/source.ts";
import { ExecutionObservationSource, invokeObservedExecutionCallback } from "../../../../../../runtime/execution-observation/index.ts";
import { sqlAdmissionFixture } from "../../../../storage/project/execution-admission/tests/fixture.ts";
import { AutomationStudioCommandExecutionController } from "../../command-execution/index.ts";
import { AutomationStudioExecutionAdmissionController } from "../controller.ts";
import { AutomationStudioService } from "../../../service.ts";
import type { AutomationStudioExecutionAdmissionContinuation } from "../continuation.ts";
import { IsolatedScopeResource } from "./resource-owner.ts";

async function fixture(operation: (value: {
  root: string;
  resource: IsolatedScopeResource;
  open(attestor?: ExecutionScopeAttestor): Promise<AutomationStudioExecutionAdmissionContinuation>;
  controller(attestor?: ExecutionScopeAttestor): AutomationStudioExecutionAdmissionController;
  store: Parameters<Parameters<typeof sqlAdmissionFixture>[0]>[0]["store"];
}) => Promise<void>) {
  await sqlAdmissionFixture(async ({ root, pool, store }) => {
    const lease = await pool.acquire("project.isolated");
    const resource = await IsolatedScopeResource.open(root);
    const requiredOwners: AutomationStudioCommandExecutionController[] = [];
    const controllers: AutomationStudioExecutionAdmissionController[] = [];
    try {
      await lease.database.run("insert into flows(flow_id,name,scope_kind,visibility,origin,source_mode,status,created_at_ms,updated_at_ms) values('flow.actual','Actual','project','project','user','visual','draft',1,1)");
      const controller = (scopeAttestor?: ExecutionScopeAttestor) => {
        const required = new AutomationStudioCommandExecutionController({ pool, getRuntimeSession: async () => null });
        requiredOwners.push(required);
        const value = new AutomationStudioExecutionAdmissionController({ pool, requiredOwner: required, getRuntimeSession: async () => null, ...(scopeAttestor ? { scopeAttestor } : {}) });
        controllers.push(value);
        return value;
      };
      await operation({ root, resource, controller, store, open: attestor => controller(attestor).open({ projectId: "project.isolated", flowId: "flow.actual" }) });
    } finally {
      await Promise.all(controllers.map(controller => controller.close()));
      await Promise.all(requiredOwners.map(required => required.close()));
      await resource.close();
      await lease.release();
    }
  });
}

function trial(continuation: AutomationStudioExecutionAdmissionContinuation, resource: IsolatedScopeResource) {
  const { assembly, scope } = continuation;
  const callbacks = new ExecutionObservationSource(scope, "fixture.resource.callbacks");
  const source = new AdmissionTestSource(scope, "fixture.resource.trials", { kind: "trial_series", seriesKey: "actual.stable-series" });
  source.delegatesTo.push(callbacks.owner);
  const ports = assembly.registerSource(source);
  callbacks.connect(assembly.registerSource(callbacks.registration([])));
  callbacks.manage({ receiver: resource, callback: resource.readResource, contract: "no_direct_effects" });
  return async (callback: (this: IsolatedScopeResource) => Promise<string> = resource.readResource) => {
    const origin = source.origin();
    const reserved = await assembly.consumer.reserve(scope, ports.issuer.fromOrdinaryAdmission(source.admit(origin)));
    try {
      const result = await invokeObservedExecutionCallback(callbacks.forParent({ reservation: reserved.reservation, parent: reserved.root }), { receiver: resource, callback, args: [] });
      await ports.producer.finish(reserved.root, source.complete(origin));
      return result;
    } catch (error) {
      await ports.producer.interrupted(reserved.root, "callback_threw");
      throw error;
    } finally {
      await assembly.consumer.release(reserved.reservation);
    }
  };
}

it("authenticates the original owned resource for actual no-effect trials and same-scope reopen", async () => fixture(async h => {
  const first = await h.open(h.resource);
  expect(first.binding.resourceKeys).toEqual([h.resource.resourceKey]);
  expect((await first.assembly.consumer.inspect(first.scope)).state).toBe("clear");
  const run = trial(first, h.resource);
  expect(await run()).toContain("actual-isolated-resource");
  expect(await run()).toContain("actual-isolated-resource");
  expect((await first.assembly.consumer.inspect(first.scope)).state).toBe("clear");
  await first.close();
  const reopened = await h.open(h.resource);
  expect(reopened.binding).toEqual(first.binding);
  expect((await reopened.assembly.consumer.inspect(reopened.scope)).state).toBe("clear");
  expect(await trial(reopened, h.resource)()).toContain("actual-isolated-resource");
}));

it.each(["absent", "null"] as const)("preserves the unverified default and refuses a second trial (%s attestor)", async kind => fixture(async h => {
  const continuation = await h.open(kind === "absent" ? undefined : { attest: () => null });
  expect(continuation.binding.resourceKeys).not.toContain(h.resource.resourceKey);
  const run = trial(continuation, h.resource);
  expect(await run()).toContain("actual-isolated-resource");
  expect((await continuation.assembly.consumer.inspect(continuation.scope)).state).toBe("unverified");
  await expect(run()).rejects.toThrow("retest_unverified");
}));

it.each(["spread", "prototype", "json", "owner"] as const)("refuses copied proofs or substituted original owner (%s)", async kind => fixture(async h => {
  const attestor: ExecutionScopeAttestor = { attest(anchor) {
    const original = h.resource.attest(anchor)!;
    if (kind === "owner") return { owner: Object.create(h.resource) as ExecutionScopeOwner, proof: original.proof };
    const proof = kind === "spread" ? { ...original.proof } : kind === "prototype" ? Object.create(original.proof) as object : JSON.parse(JSON.stringify(original.proof)) as object;
    return { owner: original.owner, proof };
  } };
  await expect(h.open(attestor).then(() => undefined)).rejects.toThrow();
}));

it.each(["projectId", "ownerKey", "continuationKey", "coverageEpoch"] as const)("refuses an authentic proof for a foreign persisted %s", async key => fixture(async h => {
  await expect(h.open({ attest: anchor => h.resource.attest({ ...anchor, [key]: `${anchor[key]}.foreign` }) }).then(() => undefined)).rejects.toThrow("scope_anchor_changed");
}));

it("pins the original attestor receiver and method at controller construction", async () => fixture(async h => {
  const attestor = { calls: 0, attest(anchor: ExecutionScopeBinding): ExecutionScopeAttestation | null {
    expect(this).toBe(attestor);
    this.calls += 1;
    expect(Object.isFrozen(anchor)).toBe(true);
    expect(Object.isFrozen(anchor.resourceKeys)).toBe(true);
    return h.resource.attest(anchor);
  } };
  const controller = h.controller(attestor);
  attestor.attest = () => { throw new Error("replacement attestor invoked"); };
  const continuation = await controller.open({ projectId: "project.isolated", flowId: "flow.actual" });
  expect(attestor.calls).toBe(1);
  expect((await continuation.assembly.consumer.inspect(continuation.scope)).state).toBe("clear");
}));

it("pins the original owner reader and refuses changes in its authenticated result", async () => fixture(async h => {
  const original = h.resource.readBinding;
  let calls = 0;
  const read = vi.spyOn(h.resource, "readBinding").mockImplementation(function (this: IsolatedScopeResource, proof) {
    const record = original.call(this, proof);
    calls += 1;
    return calls === 1 ? record : record && { ...record, baselineProofDigest: "changed-authenticated-result" };
  });
  try { await expect(h.open(h.resource).then(() => undefined)).rejects.toThrow("scope_attestation_changed"); }
  finally { read.mockRestore(); }
}));

it("retains the original owner reader and receiver if its property changes after capture", async () => fixture(async h => {
  const original = h.resource.readBinding;
  const replacement = vi.fn(() => { throw new Error("replacement reader invoked"); });
  const read = vi.spyOn(h.resource, "readBinding").mockImplementation(function (this: IsolatedScopeResource, proof) {
    expect(this).toBe(h.resource);
    const record = original.call(this, proof);
    h.resource.readBinding = replacement;
    return record;
  });
  try {
    const continuation = await h.open(h.resource);
    expect((await continuation.assembly.consumer.inspect(continuation.scope)).state).toBe("clear");
    expect(replacement).not.toHaveBeenCalled();
  } finally { read.mockRestore(); }
}));

it("propagates an attestor error and closes the failed opening without writing a scope", async () => fixture(async h => {
  const failure = new Error("actual attestation failed");
  await expect(h.open({ attest() { throw failure; } }).then(() => undefined)).rejects.toBe(failure);
  const continuation = await h.open(h.resource);
  expect((await continuation.assembly.consumer.inspect(continuation.scope)).state).toBe("clear");
}));

it("refuses a stale original proof after the actual resource lifetime ended", async () => fixture(async h => {
  const anchor = await h.store.flowBinding("flow.actual");
  const attestation = h.resource.attest(anchor)!;
  await h.resource.close();
  await expect(h.open({ attest: () => attestation }).then(() => undefined)).rejects.toThrow();
}));

it("keeps a previously unverified SQL scope sticky despite a later complete resource attestation", async () => fixture(async h => {
  const previous = await h.open();
  const epoch = previous.binding.coverageEpoch;
  await previous.close();
  const continuation = await h.open(h.resource);
  expect(continuation.binding.coverageEpoch).toBe(epoch);
  expect((await continuation.assembly.consumer.inspect(continuation.scope)).state).toBe("unverified");
}));

it("keeps the same scope and epoch unverified when an authentic owner changes the resource set", async () => fixture(async h => {
  const first = await h.open(h.resource);
  await first.close();
  const other = await IsolatedScopeResource.open(h.root);
  try {
    const changed = await h.open(other);
    expect(changed.binding.coverageEpoch).toBe(first.binding.coverageEpoch);
    expect(changed.binding.continuationKey).toBe(first.binding.continuationKey);
    expect(changed.binding.resourceKeys).toEqual([other.resourceKey]);
    expect((await changed.assembly.consumer.inspect(changed.scope)).state).toBe("unverified");
    await changed.close();
  } finally { await other.close(); }
}));

it("uses only the actual full service constructor attestor for its persisted Flow", async () => fixture(async h => {
  const service = new AutomationStudioService({ dataDir: h.root, seedFixture: false, executionScopeAttestor: h.resource });
  try {
    const project = await service.createProject({ name: "Actual owned scope fixture" });
    const flow = await service.createFlow({ projectId: project.id, name: "Actual owned scope Flow" });
    const continuation = await service.executionAdmission.open({ projectId: project.id, flowId: flow.flowId });
    expect(continuation.binding.projectId).toBe(project.id);
    expect(continuation.binding.continuationKey).toBe(flow.flowId);
    expect(continuation.binding.resourceKeys).toEqual([h.resource.resourceKey]);
    const run = trial(continuation, h.resource);
    expect(await run()).toContain("actual-isolated-resource");
    expect(await run()).toContain("actual-isolated-resource");
    expect((await continuation.assembly.consumer.inspect(continuation.scope)).state).toBe("clear");
  } finally { await service.close(); }
}));

it("keeps an actual unsupported throw pending across complete-attestation reopen and blocks another call", async () => fixture(async h => {
  const continuation = await h.open(h.resource);
  const run = trial(continuation, h.resource);
  const failure = new Error("actual callback completion lost");
  let calls = 0;
  const original = async () => {
    calls += 1;
    throw failure;
  };
  await expect(run(original)).rejects.toBe(failure);
  await continuation.close();
  const reopened = await h.open(h.resource);
  expect(reopened.binding).toEqual(continuation.binding);
  expect((await reopened.assembly.consumer.inspect(reopened.scope)).state).toBe("pending");
  await expect(trial(reopened, h.resource)(original)).rejects.toThrow("execution_blocked");
  expect(calls).toBe(1);
}));
