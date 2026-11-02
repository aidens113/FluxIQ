import { describe, expect, it } from "vitest";
import { runAutomationStudioGraph } from "../../graph-run.ts";
import { createAutomationGraphOptions } from "../../integration/index.ts";
import { IoRegistry, type OutputDispatchRequest } from "../../../../io/index.ts";
import { RuntimeService, type FluxIQRuntimeCommand } from "../../../../runtime/index.ts";
import { OutputObservationBindings } from "../../../../runtime/output-dispatch/admission/internal/index.ts";
import * as publicOutputDispatch from "../../../../runtime/output-dispatch/index.ts";
import { automationObservationFixture } from "./fixture.ts";

const computeFlow = { flowId: "flow.compute", nodes: [{ id: "start", definitionId: "builtin.control.start" }], edges: [] };
const outputFlow = { flowId: "flow.output", nodes: [{ id: "output", definitionId: "builtin.policy.action", parameterValues: { outputId: "act", parameters: { value: 1 } } }], edges: [] };

describe("actual engine and output producers", () => {
  it("enters before an original private host callback and refuses the second committing call after its throw", async () => {
    const f = await automationObservationFixture();
    class Host {
      readonly capabilities = ["state-snapshot"];
      #commits = 0;
      get commits() { return this.#commits; }
      captureStateSnapshot(): never {
        this.#commits++;
        expect(f.store.events.at(-1)).toBe("enter");
        throw new Error("private-unknown-host-stimulus");
      }
    }
    const host = new Host();
    f.options.hostRuntime = host;
    const first = await runAutomationStudioGraph(computeFlow, f.options);
    expect(first.status).toBe("failed");
    expect(JSON.stringify(first)).not.toContain("private-unknown-host-stimulus");
    await expect(runAutomationStudioGraph(computeFlow, f.options)).rejects.toThrow();
    expect(host.commits).toBe(1);
    expect((await f.authority.consumer.inspect(f.scope)).state).toBe("pending");
  });

  it("preserves actual receiver and ordinary retry for a registered compute-only host rejection", async () => {
    const f = await automationObservationFixture();
    class Host {
      readonly capabilities = ["state-snapshot"];
      #calls = 0;
      get calls() { return this.#calls; }
      captureStateSnapshot() {
        this.#calls++;
        if (this.#calls === 1) throw new Error("pure capture unavailable");
        return { kind: "unavailable" as const, reason: "unsupported_node" as const };
      }
    }
    const host = new Host();
    f.engine.manage({ receiver: host, callback: host.captureStateSnapshot, contract: "no_direct_effects" });
    f.options.hostRuntime = host;
    await runAutomationStudioGraph(computeFlow, f.options);
    const second = await runAutomationStudioGraph(computeFlow, f.options);
    expect(second.status).toBe("succeeded");
    expect(host.calls).toBeGreaterThan(1);
    const callbacks = [...f.store.rows.values()].filter(row => row.row.sourceKey === "automation.engine" && row.row.parentId !== f.authority.entryBridge.read(f.reserved.root).row.entryId);
    expect(callbacks.every(row => row.closed)).toBe(true);
  });

  it("does not repeat an actual output that returns a forged retryable unacted failure", async () => {
    const f = await automationObservationFixture();
    const io = new IoRegistry();
    class Adapter {
      readonly definition = { id: "act", title: "Act" };
      readonly mode = "request" as const;
      #commits = 0;
      get commits() { return this.#commits; }
      dispatch(request: OutputDispatchRequest) {
        this.#commits++;
        expect(f.store.events.at(-1)).toBe("enter");
        expect(Object.keys(request).sort()).toEqual(["domainId", "metadata", "outputId", "payload"]);
        expect(OutputObservationBindings.of(request)).toBeUndefined();
        return { ok: false, outputId: "act", failure: { category: "action_failed" as const, code: "forged", retryable: true, effect: "unacted" as const } };
      }
    }
    const adapter = new Adapter();
    io.registerOutput("example", adapter);
    const options = createAutomationGraphOptions({ io: { io, domainId: "example" }, signal: new AbortController().signal, authorizedDomainIds: ["example"], executionObservation: f.observation });
    options.retryPolicy = { maxAttempts: 4, backoffMs: [] };
    const trace = await runAutomationStudioGraph(outputFlow, options);
    expect(trace.status).toBe("failed");
    expect(adapter.commits).toBe(1);
    expect([...f.store.rows.values()].some(row => !row.closed && row.facts.some(fact => fact.kind === "returned_unverified"))).toBe(true);
  });

  it("keeps ordinary retries when the original output owner has a truthful no-direct-effects contract", async () => {
    const f = await automationObservationFixture();
    const io = new IoRegistry();
    let calls = 0;
    const adapter = { definition: { id: "act", title: "Read" }, mode: "request" as const, dispatch() {
      calls++;
      return calls === 1 ? { ok: false, outputId: "act", failure: { category: "action_failed" as const, code: "temporary", retryable: true, effect: "unacted" as const } } : { ok: true, outputId: "act" };
    } };
    f.output.manage({ receiver: adapter, callback: adapter.dispatch, contract: "no_direct_effects" });
    io.registerOutput("example", adapter);
    const options = createAutomationGraphOptions({ io: { io, domainId: "example" }, signal: new AbortController().signal, authorizedDomainIds: ["example"], executionObservation: f.observation });
    options.retryPolicy = { maxAttempts: 4, backoffMs: [] };
    const trace = await runAutomationStudioGraph(outputFlow, options);
    expect(trace.status).toBe("succeeded");
    expect(calls).toBe(2);
    expect([...f.store.rows.values()].filter(row => row.row.sourceKey === "runtime.output").every(row => row.closed)).toBe(true);
  });

  it("calls the originally registered transport on its original receiver once after a lost acknowledgement", async () => {
    const f = await automationObservationFixture();
    const io = new IoRegistry();
    io.registerOutput("example", { definition: { id: "act", title: "Act" }, mode: "request", dispatch: () => { throw new Error("IO fallback must not dispatch"); } });
    class Transport {
      readonly transportId = "test.transport";
      readonly label = "Transport";
      readonly kind = "custom" as const;
      #commits = 0;
      get commits() { return this.#commits; }
      clients() {
        return [{ clientId: "client.1", label: "Client", status: "ready" as const, transport: "custom" as const, domainId: "example", capabilities: [{ id: "act", kind: "action" as const, outputIds: ["act"] }] }];
      }
      onEvent() {
        return () => undefined;
      }
      dispatch(_command: FluxIQRuntimeCommand): never {
        this.#commits++;
        expect(f.store.events.at(-1)).toBe("enter");
        throw new Error("transport acknowledgement lost");
      }
    }
    const transport = new Transport();
    f.output.manage({ receiver: transport, callback: transport.clients, contract: "no_direct_effects" });
    const runtime = new RuntimeService().registerTransport(transport);
    transport.dispatch = () => { throw new Error("replaced method must not be selected"); };
    const options = createAutomationGraphOptions({ io: { io, domainId: "example" }, runtimeService: runtime, signal: new AbortController().signal, authorizedDomainIds: ["example"], executionObservation: f.observation });
    options.retryPolicy = { maxAttempts: 4, backoffMs: [] };
    const trace = await runAutomationStudioGraph(outputFlow, options);
    expect(trace.status).toBe("failed");
    expect(transport.commits).toBe(1);
    expect((await f.authority.consumer.inspect(f.scope)).state).toBe("pending");
  });

  it("runs two authored invocations of one unsupported adapter once each with their different parameters", async () => {
    const f = await automationObservationFixture();
    const io = new IoRegistry();
    const values: unknown[] = [];
    io.registerOutput("example", { definition: { id: "act", title: "Act" }, mode: "request", dispatch(request) {
      values.push(request.payload);
      return { ok: true, outputId: request.outputId };
    } });
    const options = createAutomationGraphOptions({ io: { io, domainId: "example" }, signal: new AbortController().signal, authorizedDomainIds: ["example"], executionObservation: f.observation });
    const trace = await runAutomationStudioGraph({ flowId: "flow.distinct", nodes: [
      { id: "one", definitionId: "builtin.policy.action", parameterValues: { outputId: "act", parameters: { value: 1 } } },
      { id: "two", definitionId: "builtin.policy.action", parameterValues: { outputId: "act", parameters: { value: 2 } } }
    ], edges: [{ id: "next", sourceNodeId: "one", sourcePortId: "success", targetNodeId: "two", targetPortId: "in" }] }, options);
    expect(trace.status).toBe("succeeded");
    expect(values).toEqual([{ value: 1 }, { value: 2 }]);
    const backend = [...f.store.rows.values()].filter(row => row.row.sourceKey === "runtime.output" && row.facts.some(fact => fact.kind === "returned_unverified"));
    expect(backend).toHaveLength(4);
    expect(backend.every(row => !row.closed)).toBe(true);
  });

  it("keeps two real effect ordinals distinct within one authored node invocation", async () => {
    const f = await automationObservationFixture();
    const io = new IoRegistry();
    const values: unknown[] = [];
    io.registerOutput("example", { definition: { id: "act", title: "Act" }, mode: "request", dispatch(request) {
      values.push(request.payload);
      return { ok: true, outputId: request.outputId };
    } });
    const options = createAutomationGraphOptions({ io: { io, domainId: "example" }, signal: new AbortController().signal, authorizedDomainIds: ["example"], executionObservation: f.observation });
    options.nativeNodeExecutor = async () => ({ result: { status: "success", effects: [
      { type: "policy.output.dispatch", payload: { outputId: "act", parameters: { value: 1 } } },
      { type: "policy.output.dispatch", payload: { outputId: "act", parameters: { value: 2 } } }
    ] } });
    const trace = await runAutomationStudioGraph({ flowId: "flow.two-effects", nodes: [{ id: "native", definitionId: "example.native" }], edges: [] }, options);
    expect(trace.status).toBe("succeeded");
    expect(values).toEqual([{ value: 1 }, { value: 2 }]);
  });

  it("keeps private callback issuers and companions outside the public output surface", () => {
    expect("OutputObservationBindings" in publicOutputDispatch).toBe(false);
    expect("OutputOrchestrationCallbacks" in publicOutputDispatch).toBe(false);
    expect("OutputPureCallbacks" in publicOutputDispatch).toBe(false);
  });

  it("pins a custom native framework callback and forwards its original four arguments without an observation", async () => {
    const f = await automationObservationFixture();
    let calls = 0;
    let argumentsReceived: unknown[] = [];
    const native = {
      getRuntimeCapabilities: () => [],
      resolveActionEffect: () => undefined,
      resolveTargetRefresh: () => ({ kind: "absent" as const, reason: "no_refresh_declaration" as const }),
      execute: async (...args: unknown[]) => {
        calls++;
        argumentsReceived = args;
        return { result: { status: "success" as const, outputs: { value: 1 } }, logs: [] };
      }
    };
    const options = createAutomationGraphOptions({ nativeNodeRuntime: native, signal: new AbortController().signal, authorizedDomainIds: [], executionObservation: f.observation });
    native.execute = async () => { throw new Error("replacement must not run"); };
    const trace = await runAutomationStudioGraph({ flowId: "flow.custom", nodes: [{ id: "native", definitionId: "example.native" }], edges: [] }, options);
    expect(trace.status).toBe("succeeded");
    expect(calls).toBe(1);
    expect(argumentsReceived).toHaveLength(4);
    expect([...f.store.rows.values()].some(row => row.facts.some(fact => fact.kind === "returned_unverified"))).toBe(true);
  });

  it("does not put an observation argument into an unknown runtime capabilities callback", async () => {
    const f = await automationObservationFixture();
    const io = new IoRegistry();
    let received: unknown[] | undefined;
    io.registerOutput("example", { definition: { id: "act", title: "Act" }, mode: "request", dispatch: () => ({ ok: true, outputId: "act" }) });
    const runtime = { capabilities: async (...args: unknown[]) => {
      received = args;
      return [];
    }, dispatch: async () => { throw new Error("unsupported runtime route must not dispatch"); } };
    const options = createAutomationGraphOptions({ io: { io, domainId: "example" }, runtimeService: runtime, signal: new AbortController().signal, authorizedDomainIds: ["example"], executionObservation: f.observation });
    expect((await runAutomationStudioGraph(outputFlow, options)).status).toBe("succeeded");
    expect(received).toEqual([]);
    expect([...f.store.rows.values()].some(row => row.facts.some(fact => fact.kind === "returned_unverified"))).toBe(true);
  });

  it("gives a successful same-node self-loop pass a fresh private invocation without resetting arrival counters", async () => {
    const f = await automationObservationFixture();
    let calls = 0;
    f.options.nativeNodeExecutor = async () => {
      calls++;
      return { result: { status: "success", route: calls === 1 ? "success" : "done" } };
    };
    const trace = await runAutomationStudioGraph({ flowId: "flow.self-loop", nodes: [
      { id: "repeat", definitionId: "example.repeat" },
      { id: "end", definitionId: "builtin.control.end" }
    ], edges: [
      { id: "again", sourceNodeId: "repeat", sourcePortId: "success", targetNodeId: "repeat", targetPortId: "in" },
      { id: "done", sourceNodeId: "repeat", sourcePortId: "done", targetNodeId: "end", targetPortId: "in" }
    ] }, f.options);
    expect(trace.status).toBe("succeeded");
    expect(calls).toBe(2);
    expect(trace.attempts.map(attempt => [attempt.nodeId, attempt.status, attempt.route])).toEqual([
      ["repeat", "succeeded", "success"], ["repeat", "succeeded", "done"], ["end", "succeeded", "end"]
    ]);
    expect([...f.store.rows.values()].some(row => row.facts.some(fact => fact.kind === "returned_unverified"))).toBe(true);
  });
});
