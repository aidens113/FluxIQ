// @fluxiq-test-group real-sql
// The service's graph-entry input authority (t905 unit B) on the real engine and the real durable input owner:
// an entry seals only when every assembled layer's origin is authenticated, and unknown provenance stays unknown.
import { describe, expect, it, vi } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { automationNodeStateBinding } from "../../../../../../components/automation/index.ts";
import { resumeAutomationStudioGraphRun, runAutomationStudioGraph, type AutomationStudioGraphExecutionOptions, type AutomationStudioGraphRunSeed } from "../../../../../../engine/automation/index.ts";
import type { AutomationStudioInputUseChildCapture, AutomationStudioInputUseFrameCapture } from "../../../../../../engine/automation/input-use/index.ts";
import type { AutomationStudioInputBasisStorage, AutomationStudioInputScope } from "../../../../../../runtime/input-basis/index.ts";
import { runWithAutomationStudioRunSecrets } from "../../../../../../runtime/run-secrets/index.ts";
import { withInputBasisStore } from "../../tests/fixtures.ts";
import { AutomationStudioInputUseExecutions, AutomationStudioInputUseServiceAuthority, type AutomationStudioInputUseEntry } from "../index.ts";

vi.setConfig({ testTimeout: 60_000 });

const scope: AutomationStudioInputScope = { projectId: "project.one", taskId: "task.one", principalId: "principal.one", producerId: "flow-run.entry" };
const slot = (role: string): AutomationStudioInputScope => ({ ...scope, producerId: `${scope.producerId}.${role}` });
const flow = {
  schemaVersion: "0.1" as const, flowId: "flow.input-basis", ownerKind: "task" as const, ownerId: "task.input-basis", name: "Input basis", createdAt: 1, updatedAt: 1,
  nodes: [{ id: "echo", definitionId: "builtin.data.constant", parameterValues: { value: automationNodeStateBinding("query") } }], edges: []
};
const location = { invocationId: "invocation.root", graphFlowId: flow.flowId, graphRevision: null, subflowId: null };

async function run(storage: AutomationStudioInputBasisStorage, entry: AutomationStudioInputUseEntry, inputs: JsonObject, extra: Partial<AutomationStudioGraphExecutionOptions> = {}) {
  const session = new AutomationStudioInputUseExecutions(() => storage).open(scope, entry);
  let used: unknown;
  try {
    const saved = await runAutomationStudioGraph(flow, { inputs, inputUse: session.port, ...extra }, trace => { used = trace.values["echo.value"]; });
    return { saved, used, observation: session.read(saved) };
  } finally {
    session.close();
  }
}

describe("graph-entry input authority over the durable owner", () => {
  it("seals a request-origin caller layer, runs the leased copy and records the layer as the entry's producer", async () => withInputBasisStore(async ({ store }) => {
    const { saved, used, observation } = await run(store, { layers: [{ role: "caller", values: { query: "lamps" }, origin: { kind: "request" } }] }, { query: "lamps" });
    expect(saved.status).toBe("succeeded");
    expect(used).toBe("lamps");
    expect(observation).toMatchObject({ status: "sealed", coverage: "graph_entry_inputs", location: { graphFlowId: flow.flowId } });
    const entry = await store.read(scope), caller = await store.read(slot("caller"));
    expect(observation.status === "sealed" && observation.reference).toEqual(entry?.head?.reference);
    expect(entry?.head?.producers).toEqual([{ role: "caller", reference: caller?.head?.reference }]);
    expect(JSON.stringify(observation)).not.toContain("lamps");
  }));

  it("authenticates a root input from an earlier run only through that run's current issued revision, across a restart", async () => withInputBasisStore(async fixture => {
    const earlier = await run(fixture.store, { layers: [{ role: "caller", values: { query: "earlier" }, origin: { kind: "request" } }] }, { query: "earlier" });
    if (earlier.observation.status !== "sealed") throw new Error(`earlier run did not seal: ${JSON.stringify(earlier.observation)}`);
    const first = earlier.observation.reference;
    const { store } = await fixture.restart();
    const inherited = (origin?: AutomationStudioInputUseEntry["layers"][number]["origin"], values: JsonObject = { query: "earlier" }): AutomationStudioInputUseEntry => ({ layers: [{ role: "inherited", values, ...(origin ? { origin } : {}) }] });

    const authenticated = await run(store, inherited({ kind: "revision", producerId: scope.producerId, reference: first }), { query: "earlier" });
    expect(authenticated.used).toBe("earlier");
    expect(authenticated.observation).toMatchObject({ status: "sealed", coverage: "graph_entry_inputs" });
    const head = (await store.read(scope))?.head;
    expect(head?.producers.map(producer => producer.role)).toEqual(["inherited"]);
    expect(head?.reference).toMatchObject({ bindingId: first.bindingId, revision: first.revision + 1 });

    const absent = await run(store, inherited(), { query: "earlier" });
    expect(absent.used).toBe("earlier");
    expect(absent.observation).toEqual({ status: "unknown", code: "origin_unverified" });
    const stale = await run(store, inherited({ kind: "revision", producerId: scope.producerId, reference: first }), { query: "earlier" });
    expect(stale.observation).toEqual({ status: "unknown", code: "stale" });
    const forged = await run(store, inherited({ kind: "revision", producerId: scope.producerId, reference: head!.reference }, { query: "forged" }), { query: "forged" });
    expect(forged.used).toBe("forged");
    expect(forged.observation).toEqual({ status: "unknown", code: "origin_unverified" });
    const foreign = await run(store, inherited({ kind: "revision", producerId: scope.producerId, reference: { ownerId: "input.owner.foreign", bindingId: head!.reference.bindingId, revision: head!.reference.revision } }), { query: "earlier" });
    expect(foreign.observation).toEqual({ status: "unknown", code: "stale" });
    expect((await store.read(scope))?.head).toEqual(head);
  }));

  it("keeps unknown provenance unknown: an unattributed key and executable-owned root defaults", async () => withInputBasisStore(async ({ store }) => {
    const caller: AutomationStudioInputUseEntry = { layers: [{ role: "caller", values: { query: "asked" }, origin: { kind: "request" } }] };
    const extra = await run(store, caller, { query: "asked", unattributed: "from elsewhere" });
    expect(extra.saved.status).toBe("succeeded");
    expect(extra.used).toBe("asked");
    expect(extra.observation).toEqual({ status: "unknown", code: "origin_unverified" });
    const defaults = await run(store, caller, { query: "asked" }, { declaredInputDefaults: { query: "asked" } });
    expect(defaults.used).toBe("asked");
    expect(defaults.observation).toEqual({ status: "unknown", code: "origin_unverified" });
    expect(await store.read(scope)).toBeUndefined();
  }));

  it("leaves a seeded continuation unknown, runs it as an ordinary resume and writes nothing", async () => withInputBasisStore(async ({ store }) => {
    const resumed = { ...flow, nodes: [{ id: "start", definitionId: "builtin.control.start" }, ...flow.nodes], edges: [{ id: "start.echo", sourceNodeId: "start", targetNodeId: "echo", sourcePortId: "success", targetPortId: "in" }] };
    const seed: AutomationStudioGraphRunSeed = { startedAt: 1, stepsTaken: 1, maxSteps: 10,
      attempts: [{ attemptId: "start.attempt.1", nodeId: "start", definitionId: "builtin.control.start", startedAt: 1, finishedAt: 1, status: "succeeded", route: "success", inputs: {}, outputs: {}, effects: [] }],
      values: { query: "seeded", seeded: true }, effects: [], regionTransitions: [], variables: { later: "seed-variable" }, loops: {}, route: "success" };
    const ordinary = await resumeAutomationStudioGraphRun(resumed, { inputs: { query: "restored" }, startNodeId: "start", now: () => 2 }, structuredClone(seed));
    const session = new AutomationStudioInputUseExecutions(() => store).open(scope, { layers: [{ role: "caller", values: { query: "restored" }, origin: { kind: "request" } }] });
    try {
      const saved = await resumeAutomationStudioGraphRun(resumed, { inputs: { query: "restored" }, inputUse: session.port, startNodeId: "start", now: () => 2 }, structuredClone(seed));
      expect(saved).toEqual(ordinary);
      expect(session.read(saved)).toEqual({ status: "unknown", code: "resume_state_unverified" });
    } finally { session.close(); }
    expect(await store.read(scope)).toBeUndefined();
  }));

  it("advances the entry revision when only a shadowed layer changes, stales the old reference and reuses an unchanged one", async () => withInputBasisStore(async ({ store, owner }) => {
    const layered = (inherited: string): AutomationStudioInputUseEntry => ({ layers: [
      { role: "inherited", values: { query: inherited }, origin: { kind: "request" } }, { role: "caller", values: { query: "chosen" }, origin: { kind: "request" } }] });
    const a = await run(store, layered("first"), { query: "chosen" });
    const b = await run(store, layered("second"), { query: "chosen" });
    const c = await run(store, layered("second"), { query: "chosen" });
    if (a.observation.status !== "sealed" || b.observation.status !== "sealed" || c.observation.status !== "sealed") throw new Error("expected three seals");
    expect([a.used, b.used, c.used]).toEqual(["chosen", "chosen", "chosen"]);
    expect(b.observation.reference).toEqual({ ...a.observation.reference, revision: a.observation.reference.revision + 1 });
    expect(c.observation.reference).toEqual(b.observation.reference);
    expect(await owner.verifyCurrent(scope, a.observation.reference)).toEqual({ status: "unknown", code: "stale" });
  }));

  it("withdraws the seal when a layer producer changes during execution without anybody re-observing the entry", async () => withInputBasisStore(async ({ store, owner }) => {
    const native = { ...flow, nodes: [{ id: "native", definitionId: "synthetic.native" }] };
    const session = new AutomationStudioInputUseExecutions(() => store).open(scope, { layers: [{ role: "caller", values: { query: "before" }, origin: { kind: "request" } }] });
    try {
      const saved = await runAutomationStudioGraph(native, { inputs: { query: "before" }, inputUse: session.port, nativeNodeExecutor: async () => {
        const changed = await owner.observe(slot("caller"), { query: "changed" }, []);
        expect(changed.status).toBe("bound");
        return { result: { status: "success", route: "success", outputs: {} } };
      } });
      expect(saved.status).toBe("succeeded");
      expect(session.read(saved)).toEqual({ status: "unknown", code: "producer_unverified" });
    } finally { session.close(); }
  }));

  it("keeps an active secret context unknown without asking the owner anything", async () => withInputBasisStore(async ({ store }) => {
    const read = vi.spyOn(store, "read");
    const { used, observation } = await runWithAutomationStudioRunSecrets({ token: "secret-value" }, () => run(store, { layers: [{ role: "caller", values: { query: "lamps" }, origin: { kind: "request" } }] }, { query: "lamps" }));
    expect(used).toBe("lamps");
    expect(observation).toEqual({ status: "unknown", code: "active_secrets" });
    expect(read).not.toHaveBeenCalled();
  }));

  it("refuses forks and non-root frames, and propagates cancellation's exact reason without publishing", async () => withInputBasisStore(async ({ store }) => {
    const entry: AutomationStudioInputUseEntry = { layers: [{ role: "caller", values: { query: "x" }, origin: { kind: "request" } }] };
    const capture: AutomationStudioInputUseFrameCapture = { values: { query: "x" }, location };
    const direct = new AutomationStudioInputUseServiceAuthority({ storage: store, scope, entry });
    const fork: AutomationStudioInputUseChildCapture = {
      boundary: { inputs: {}, declaredInputDefaults: {}, contract: { interface: { inputs: [], outputs: [] }, errors: [] }, bindings: {}, callInputs: {} },
      parent: location, child: { ...location, invocationId: "invocation.child", parentInvocationId: location.invocationId, callNodeId: "call" }
    };
    await expect(direct.child(fork)).resolves.toEqual({ status: "unknown", code: "fork_unverified" });
    await expect(direct.open({ ...capture, location: { ...location, parentInvocationId: "invocation.parent", callNodeId: "call" } })).resolves.toEqual({ status: "unknown", code: "unverified_frame" });

    let release!: () => void;
    const held = new Promise<void>(done => { release = done; });
    const gated: AutomationStudioInputBasisStorage = { durable: store.durable, read: async target => {
      await held;
      return await store.read(target);
    }, writeSnapshot: (...args) => store.writeSnapshot(...args), readSnapshot: (...args) => store.readSnapshot(...args), compareAndSwap: (...args) => store.compareAndSwap(...args) };
    const stop = new AbortController(), reason = new Error("person.stopped");
    const opening = new AutomationStudioInputUseServiceAuthority({ storage: gated, scope, entry }).open(capture, stop.signal);
    stop.abort(reason);
    await expect(opening).rejects.toBe(reason);
    release();
    expect(await store.read(scope)).toBeUndefined();
  }));
});
