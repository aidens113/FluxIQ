import { describe, expect, it, vi } from "vitest";
import type { AutomationStudioFlowDocument } from "../../model/index.ts";
import type { AutomationStudioFlowNode } from "../../model/index.ts";
import { defineOutput, IoRegistry } from "../../../../io/index.ts";
import { AUTOMATION_STUDIO_IMPORTER_SDK_VERSION, automationNodeStateBinding, resolveAutomationStudioNodeActionEffect, type AutomationNodeExecutionResult, type AutomationStudioImporterSdkManifest, type AutomationStudioNativeNodeContext, type AutomationStudioNodeDefinition } from "../../nodes/index.ts";
import type { AutomationStudioRunDatasetSummary } from "@fluxiq/contracts/automation-studio";
import type { AutomationStudioRecordBatch } from "../executor/index.ts";
import { runAutomationStudioGraph } from "../executor.ts";
import { validateAutomationStudioFlowBootstrapPlan, type AutomationStudioFlowBootstrapPlan } from "../flow-bootstrap/index.ts";
import { AutomationStudioNativeNodeRuntime } from "../native-node-runtime.ts";
import { automationStudioRunGraphOptions } from "../service/runtime-session/index.ts";

function node(overrides: Partial<AutomationStudioNodeDefinition> = {}): AutomationStudioNodeDefinition {
  return {
    schemaVersion: "0.1", id: "example.transform", version: "1.0.0", label: "Transform", description: "Importer transform", category: "custom",
    source: { kind: "importer", domainId: "example", packageId: "example.package", implementationKey: "transform" }, availability: { kind: "domain", domainId: "example" },
    capabilities: { executable: true, codeBacked: true }, inputs: [{ id: "in", label: "In", valueType: "number" }], outputs: [{ id: "result", label: "Result", valueType: "number" }], parameters: [], ...overrides
  };
}
function manifest(nodes = [node()]): AutomationStudioImporterSdkManifest { return { schemaVersion: "0.1", sdkVersion: AUTOMATION_STUDIO_IMPORTER_SDK_VERSION, packageId: "example.package", packageVersion: "1.0.0", domainId: "example", nodes }; }

function effectFlow(instance: AutomationStudioFlowNode): AutomationStudioFlowDocument {
  return { schemaVersion: "0.1", flowId: "flow.effect", ownerKind: "routine", ownerId: "flow.effect", name: "Trusted effect", createdAt: 1, updatedAt: 1, nodes: [instance], edges: [] };
}

describe("trusted-local native node runtime", () => {
  it("retains the trusted effect floor through manifest serialization, SDK copies and getDefinition without execution", () => {
    const declared = node({
      actionEffect: { effectClass: "state", commitWhen: "apply", permissionConsequences: ["create_new"] },
      parameters: [{ id: "apply", label: "Apply", valueType: "boolean", defaultValue: false }]
    });
    const original = manifest([declared]);
    const restored: AutomationStudioImporterSdkManifest = JSON.parse(JSON.stringify(structuredClone(original)));
    const implementation = vi.fn(() => ({ outputs: {} }));
    const runtime = new AutomationStudioNativeNodeRuntime().register(restored, {
      packageId: original.packageId,
      packageVersion: original.packageVersion,
      implementations: { transform: implementation }
    });
    const definition = runtime.getDefinition(declared.id);
    expect(definition?.actionEffect).toEqual(declared.actionEffect);
    expect(runtime.sdk.get(original.packageId)?.nodes[0]?.actionEffect).toEqual(declared.actionEffect);
    expect(runtime.listDefinitions()[0]?.actionEffect).toEqual(declared.actionEffect);
    expect(definition && resolveAutomationStudioNodeActionEffect(definition, { apply: false })).toEqual({ effectClass: "commit", permissionConsequences: ["create_new"] });
    expect(implementation).not.toHaveBeenCalled();
  });

  it("passes a session reference through the canonical native host adapter and drops malformed direct references", async () => {
    const references: Array<number | undefined> = [];
    const runtime = new AutomationStudioNativeNodeRuntime().register(manifest(), {
      packageId: "example.package", packageVersion: "1.0.0",
      implementations: { transform: ({ host }) => {
        references.push(host?.referenceNow);
        return { outputs: { result: 1 } };
      } }
    });
    const instance = { id: "native", definitionId: "example.transform" };
    const flow: AutomationStudioFlowDocument = { schemaVersion: "0.1", flowId: "flow.reference", ownerKind: "routine", ownerId: "flow.reference", name: "Reference", createdAt: 1, updatedAt: 1, nodes: [instance], edges: [] };
    const referenceNow = Date.UTC(2026, 9, 30, 23, 59, 59);
    const options = automationStudioRunGraphOptions({ signal: new AbortController().signal, authorizedDomainIds: [], nativeNodeRuntime: runtime, referenceNow });
    const trace = await runAutomationStudioGraph(flow, { ...options, now: () => referenceNow + 2_000 });
    expect(trace.status).toBe("succeeded");
    await runtime.execute(instance, {});
    await runtime.execute(instance, {}, undefined, { referenceNow: NaN, capabilityIds: [], sideEffectClass: "none" });
    expect(references).toEqual([referenceNow, undefined, undefined]);
  });

  it("registers manifests and isolates implementation inputs to declared ports", async () => {
    let received: Record<string, unknown> = {};
    const runtime = new AutomationStudioNativeNodeRuntime().register(manifest(), { packageId: "example.package", packageVersion: "1.0.0", implementations: { transform: ({ inputs, log }) => { received = inputs; log({ level: "info", message: "done", data: { token: "secret", visible: "yes" } }); return { outputs: { result: Number(inputs.in) * 2 } }; } } });
    const flow: AutomationStudioFlowDocument = { schemaVersion: "0.1", flowId: "flow.native", ownerKind: "policy", ownerId: "flow.native", name: "Native", nodes: [{ id: "native", definitionId: "example.transform" }], edges: [], createdAt: 1, updatedAt: 1 };
    const trace = await runAutomationStudioGraph(flow, { inputs: { in: 4, ambientSecret: "must-not-cross" }, nativeNodeExecutor: ({ node: instance, inputs, signal }) => runtime.execute(instance, inputs, signal) });
    expect(trace.status).toBe("succeeded"); expect(trace.values.result).toBe(8); expect(received).toEqual({ in: 4 });
    expect(trace.attempts[0]?.logs).toEqual([{ level: "info", message: "done", data: { token: "[REDACTED]", visible: "yes" } }]);
  });

  it("fills a declared port from the Flow's inputs, never from a bare key another node left behind", async () => {
    const source = node({ id: "example.source", source: { kind: "importer", domainId: "example", packageId: "example.package", implementationKey: "source" }, inputs: [], outputs: [{ id: "in", label: "In", valueType: "number" }] });
    const seen: Record<string, unknown>[] = [];
    const runtime = new AutomationStudioNativeNodeRuntime().register(manifest([node(), source]), { packageId: "example.package", packageVersion: "1.0.0", implementations: { source: () => ({ outputs: { in: 99 } }), transform: ({ inputs }) => { seen.push(inputs); return { outputs: { result: 1 } }; } } });
    const flow: AutomationStudioFlowDocument = { schemaVersion: "0.1", flowId: "flow.native.leak", ownerKind: "policy", ownerId: "flow.native.leak", name: "Leak", nodes: [{ id: "source", definitionId: "example.source" }, { id: "native", definitionId: "example.transform" }], edges: [{ id: "source.native", sourceNodeId: "source", sourcePortId: "success", targetNodeId: "native", targetPortId: "in" }], createdAt: 1, updatedAt: 1 };
    const withInput = await runAutomationStudioGraph(flow, { inputs: { in: 4, ambientSecret: "must-not-cross" }, nativeNodeExecutor: ({ node: instance, inputs, signal }) => runtime.execute(instance, inputs, signal) });
    const withoutInput = await runAutomationStudioGraph(flow, { nativeNodeExecutor: ({ node: instance, inputs, signal }) => runtime.execute(instance, inputs, signal) });
    expect(withInput.status).toBe("succeeded"); expect(withoutInput.status).toBe("succeeded");
    expect(withInput.values.in).toBe(99);
    expect(seen).toEqual([{ in: 4 }, {}]);
  });

  it("projects defensive registry resolution from the runtime grants", () => {
    const runtime = new AutomationStudioNativeNodeRuntime({
      permissions: ["native.execute"],
      runtimeCapabilities: ["native.actions"]
    });
    const first = runtime.getRegistryResolution({ kind: "domain", domainId: "example" });
    expect(first).toEqual({
      scope: { kind: "domain", domainId: "example" },
      permissions: ["native.execute"],
      runtimeCapabilities: ["native.actions"]
    });
    (first.permissions as string[]).push("mutated");
    (first.runtimeCapabilities as string[]).push("mutated");
    expect(runtime.getRegistryResolution({ kind: "domain", domainId: "example" })).toEqual({
      scope: { kind: "domain", domainId: "example" },
      permissions: ["native.execute"],
      runtimeCapabilities: ["native.actions"]
    });
  });

  it("provides the common element matcher to native implementations", async () => {
    const runtime = new AutomationStudioNativeNodeRuntime().register(manifest(), {
      packageId: "example.package",
      packageVersion: "1.0.0",
      implementations: {
        transform: ({ elementMatcher }) => {
          const best = elementMatcher.bestCandidate({ visibleText: "Save", id: "save" }, [{ candidateId: "wrong", visibleText: "Cancel" }, { candidateId: "right", visibleText: "Save", id: "save" }]);
          return { outputs: { result: best?.candidateId === "right" ? 1 : 0 } };
        }
      }
    });
    await expect(runtime.execute({ id: "native", definitionId: "example.transform" }, {})).resolves.toMatchObject({ result: { outputs: { result: 1 } } });
  });

  it("provides registered target resolvers to native implementations", async () => {
    const withResolver = { ...manifest(), targetResolvers: [{ id: "element", version: "1.0.0", description: "Resolves element targets" }] };
    const runtime = new AutomationStudioNativeNodeRuntime().register(withResolver, {
      packageId: "example.package",
      packageVersion: "1.0.0",
      implementations: {
        transform: async ({ resolveTarget }) => {
          const target = await resolveTarget("element", { selector: "#save" });
          return { outputs: { result: target?.kind === "element" ? 1 : 0 } };
        }
      },
      targetResolvers: {
        element: (target) => ({ kind: "element", fingerprint: { selector: String(target.selector ?? "") } })
      }
    });
    await expect(runtime.execute({ id: "native", definitionId: "example.transform" }, {})).resolves.toMatchObject({ result: { outputs: { result: 1 } } });
  });

  it("returns traceable denial for least-privilege requirements", async () => {
    const restricted = node({ safety: { requiredPermissions: ["native.execute"], runtime: { networkDestinations: ["https://api.example.test"], secretHandles: ["secret.api"] } } });
    const runtime = new AutomationStudioNativeNodeRuntime({ permissions: ["native.execute"] }).register(manifest([restricted]), { packageId: "example.package", packageVersion: "1.0.0", implementations: { transform: () => ({ outputs: { result: 1 } }) } });
    await expect(runtime.execute({ id: "native", definitionId: restricted.id }, {})).resolves.toMatchObject({ result: { status: "failed", outputs: { error: expect.stringContaining("network destination") } } });
  });

  it("bounds cooperative timeout and cancellation", async () => {
    const runtime = new AutomationStudioNativeNodeRuntime().register(manifest(), { packageId: "example.package", packageVersion: "1.0.0", implementations: { transform: ({ signal }) => new Promise((resolve) => signal.addEventListener("abort", () => resolve({ status: "failed" }), { once: true })) } });
    await expect(runtime.execute({ id: "native", definitionId: "example.transform", metadata: { timeoutMs: 10 } }, {}, undefined, { referenceNow: 1, capabilityIds: [], sideEffectClass: "none" })).resolves.toMatchObject({ result: { status: "failed", outputs: { error: expect.stringContaining("exceeded 10ms") } } });
    const controller = new AbortController(); const execution = runtime.execute({ id: "native", definitionId: "example.transform" }, {}, controller.signal); controller.abort();
    await expect(execution).resolves.toMatchObject({ result: { status: "failed" } });
  });

  it("enforces output ports and output-action contracts", async () => {
    const action = node({ id: "example.action", source: { kind: "importer", domainId: "example", packageId: "example.package", implementationKey: "action" }, outputs: [{ id: "ok", label: "OK", valueType: "boolean" }], outputAction: { fixedOutputId: "example.click" } });
    const runtime = new AutomationStudioNativeNodeRuntime().register(manifest([action]), { packageId: "example.package", packageVersion: "1.0.0", implementations: { action: () => ({ outputs: { ok: true }, effects: [{ type: "policy.output.dispatch", payload: { outputId: "other.output", parameters: {} } }] }) } });
    await expect(runtime.execute({ id: "action", definitionId: action.id }, {})).resolves.toMatchObject({ result: { status: "failed", outputs: { error: expect.stringContaining("undeclared output") } } });
    const allowed = new AutomationStudioNativeNodeRuntime().register(manifest([action]), { packageId: "example.package", packageVersion: "1.0.0", implementations: { action: () => ({ outputs: { ok: true }, effects: [{ type: "policy.output.dispatch", payload: { outputId: "example.click", parameters: {} } }] }) } });
    let dispatched = "";
    const flow: AutomationStudioFlowDocument = { schemaVersion: "0.1", flowId: "flow.action", ownerKind: "policy", ownerId: "flow.action", name: "Action", nodes: [{ id: "action", definitionId: action.id }], edges: [], createdAt: 1, updatedAt: 1 };
    const trace = await runAutomationStudioGraph(flow, { nativeNodeExecutor: ({ node: instance, inputs, signal }) => allowed.execute(instance, inputs, signal), effectDispatcher: (effect) => { dispatched = String((effect.payload as any)?.outputId ?? ""); return { status: "success", outputs: { confirmed: true } }; } });
    expect(trace.status).toBe("succeeded"); expect(dispatched).toBe("example.click"); expect(trace.values.confirmed).toBe(true);
  });

  it("rejects SDK version mismatches, missing implementations, and Code Node action forging", async () => {
    const invalid = { ...manifest(), sdkVersion: "9.0" as any }; expect(() => new AutomationStudioNativeNodeRuntime().register(invalid, { packageId: "example.package", packageVersion: "1.0.0", implementations: { transform: () => ({}) } })).toThrow("version_mismatch");
    expect(() => new AutomationStudioNativeNodeRuntime().register(manifest(), { packageId: "example.package", packageVersion: "1.0.0", implementations: {} })).toThrow("Missing trusted-local implementation");
    const code = node({ id: "example.code", source: { kind: "code", moduleId: "nodes/code.ts", implementationKey: "code", trust: "trusted-local" } });
    const runtime = new AutomationStudioNativeNodeRuntime().register(manifest([code]), { packageId: "example.package", packageVersion: "1.0.0", implementations: { code: () => ({ effects: [{ type: "policy.output.dispatch", payload: { outputId: "example.click" } }] }) } });
    await expect(runtime.execute({ id: "code", definitionId: code.id }, {})).resolves.toMatchObject({ result: { status: "failed", outputs: { error: expect.stringContaining("cannot dispatch") } } });
  });

  it("refuses a node instance whose pinned definition version is unavailable", async () => {
    const runtime = new AutomationStudioNativeNodeRuntime().register(manifest(), { packageId: "example.package", packageVersion: "1.0.0", implementations: { transform: () => ({ outputs: { result: 1 } }) } });
    await expect(runtime.execute({ id: "native", definitionId: "example.transform", definitionVersion: "2.0.0" }, {})).resolves.toMatchObject({ result: { status: "failed", outputs: { error: expect.stringContaining("requires definition version 2.0.0") } } });
  });

  it("requires declared importer extension implementations", () => {
    const withMapper = { ...manifest(), recordingMappers: [{ id: "mapper", version: "1.0.0", description: "Mapper" }] };
    expect(() => new AutomationStudioNativeNodeRuntime().register(withMapper, { packageId: "example.package", packageVersion: "1.0.0", implementations: { transform: () => ({ outputs: { result: 1 } }) } })).toThrow("Missing importer recording mapper implementation mapper");
  });
});

describe("the parameter contracts an importer bundle carries", () => {
  const items = node({
    id: "example.items",
    source: { kind: "importer", domainId: "example", packageId: "example.package", implementationKey: "items" },
    inputs: [],
    outputs: [{ id: "success", label: "Success", valueType: "any" }],
    parameters: [{ id: "items", label: "Items", valueType: "object", required: true }],
    outputAction: { fixedOutputId: "example.items" }
  });
  const bundle = { packageId: "example.package", packageVersion: "1.0.0", implementations: { items: () => ({ outputs: { success: true } }) } };
  const contract = ({ value }: { value: unknown }) => (value as { item?: unknown }).item ? [] : ["example.items.missing_item"];
  const plan = (parameters: AutomationStudioFlowBootstrapPlan["subflows"][number]["nodes"][number]["parameters"]): AutomationStudioFlowBootstrapPlan => ({
    schemaVersion: "0.1",
    router: { name: "Example", rules: [], fallback: { kind: "subflow", targetSubflowKey: "primary" } },
    subflows: [{ key: "primary", name: "Primary", role: "primary", edges: [], nodes: [{ key: "items", definitionId: "example.items", definitionVersion: "1.0.0", outputActionId: "example.items", ...(parameters ? { parameters } : {}) }] }]
  });

  it("reach validation of a generated plan through the registry the runtime exposes", () => {
    const runtime = new AutomationStudioNativeNodeRuntime().register(manifest([items]), { ...bundle, parameterContracts: { "example.items": contract } });
    const validate = (parameters: NonNullable<AutomationStudioFlowBootstrapPlan["subflows"][number]["nodes"][number]["parameters"]>) => validateAutomationStudioFlowBootstrapPlan({
      plan: plan(parameters),
      registry: runtime.sdk.nodes,
      resolution: runtime.getRegistryResolution({ kind: "domain", domainId: "example" })
    });

    expect(runtime.sdk.nodes.getParameterContract("example.items")).toBe(contract);
    expect(validate({ items: { nonsense: true } }).issues).toEqual([{
      severity: "error",
      code: "example.items.missing_item",
      message: "Node parameter value does not satisfy its domain contract.",
      path: "plan.subflows.0.nodes.0.parameters.items"
    }]);
    expect(validate({ items: { item: ".row" } })).toMatchObject({ ok: true, issues: [] });
    expect(runtime.listDefinitions()).toHaveLength(1);
  });

  it("leave a node without one unconstrained", () => {
    const runtime = new AutomationStudioNativeNodeRuntime().register(manifest([items]), bundle);

    expect(runtime.sdk.nodes.getParameterContract("example.items")).toBeUndefined();
  });

  it("must name a node the manifest declares, and be functions, or nothing is registered", () => {
    const unknown = new AutomationStudioNativeNodeRuntime();
    expect(() => unknown.register(manifest([items]), { ...bundle, parameterContracts: { "example.elsewhere": contract } }))
      .toThrow("Parameter contract example.elsewhere is not declared by manifest example.package.");
    expect(unknown.listDefinitions()).toEqual([]);

    const notFunction = new AutomationStudioNativeNodeRuntime();
    expect(() => notFunction.register(manifest([items]), { ...bundle, parameterContracts: { "example.items": "check" as never } }))
      .toThrow("Parameter contract example.items must be a function.");
    expect(notFunction.listDefinitions()).toEqual([]);
  });
});

describe("the records an importer node declares", () => {
  const recordOutput = {
    datasetId: "listings",
    label: "Listings",
    recordsPath: "result.extracted",
    writeMode: "replace",
    schema: {
      schemaVersion: "0.1",
      fields: [
        { id: "title", label: "Title", valueType: "string", required: true },
        { id: "secret", label: "Secret", valueType: "string", handling: "exclude" }
      ]
    }
  };
  const extract = node({
    id: "example.extract",
    source: { kind: "importer", domainId: "example", packageId: "example.package", implementationKey: "extract" },
    inputs: [],
    outputs: [
      { id: "success", label: "Success", valueType: "any" },
      { id: "failed", label: "Failed", valueType: "any" },
      { id: "records", label: "Records", valueType: "array", role: "data" }
    ],
    parameters: [{ id: "recordOutput", label: "Save records", valueType: "json", allowStateBinding: false, ui: { control: "record-output" } }],
    outputAction: { fixedOutputId: "example.extract" }
  });
  const runtime = new AutomationStudioNativeNodeRuntime().register(manifest([extract]), {
    packageId: "example.package",
    packageVersion: "1.0.0",
    implementations: {
      extract: ({ parameters }) => ({
        status: "success",
        outputs: { success: true },
        effects: [{ type: "policy.output.dispatch", payload: { outputId: "example.extract", parameters: {}, recordOutput: parameters.recordOutput ?? null } }]
      })
    }
  });

  it("pass the result boundary with the record output still in the dispatch", async () => {
    const execution = await runtime.execute({ id: "extract", definitionId: extract.id, parameterValues: { recordOutput } }, {});

    expect(execution?.result.status).toBe("success");
    expect(execution?.result.effects).toEqual([{ type: "policy.output.dispatch", payload: { outputId: "example.extract", parameters: {}, recordOutput } }]);
  });

  it("are captured from the output's answer and handed to the dataset store, without the excluded field", async () => {
    const batches: AutomationStudioRecordBatch[] = [];
    const flow: AutomationStudioFlowDocument = { schemaVersion: "0.1", flowId: "flow.extract", ownerKind: "policy", ownerId: "flow.extract", name: "Extract", nodes: [{ id: "extract", definitionId: extract.id, parameterValues: { recordOutput } }], edges: [], createdAt: 1, updatedAt: 1 };

    const trace = await runAutomationStudioGraph(flow, {
      nativeNodeExecutor: ({ node: instance, inputs, signal }) => runtime.execute(instance, inputs, signal),
      // The output's payload is `outputs.result`; `recordsPath` is read inside it.
      effectDispatcher: () => ({ status: "success", outputs: { result: { result: { extracted: [{ title: "First", secret: "withheld-value" }, { title: "Second" }] } } } }),
      onRecordBatch: (batch): AutomationStudioRunDatasetSummary => {
        batches.push(batch);
        return { runId: "run", datasetId: batch.datasetId, nodeIds: [batch.nodeId], schemaDigest: "digest", recordCount: batch.rows.length, truncated: batch.truncated, invalidCount: batch.invalidCount, updatedAt: 1 };
      }
    });

    expect(trace.status).toBe("succeeded");
    expect(batches).toHaveLength(1);
    expect(batches[0]).toMatchObject({ nodeId: "extract", datasetId: "listings", writeMode: "replace", invalidCount: 0, rows: [{ title: "First" }, { title: "Second" }] });
    // The trace keeps a dataset marker where the rows were, never the rows.
    expect(trace.values.records).toHaveProperty("$dataset");
    expect(JSON.stringify(trace)).not.toContain("withheld-value");
  });
});

describe("canonical action effects in real native and policy dispatch paths", () => {
  it("retries a canonical safe state setter after verification while declared lasting classes still stop it", async () => {
    for (const lasting of [false, true]) {
      let calls = 0;
      const implementation = (): AutomationNodeExecutionResult => {
        calls += 1;
        return calls < 3 ? { status: "failed", outputs: {}, failure: { category: "output_not_observed", code: "example.read_back", retryable: true, stage: "verification" } } : { outputs: {} };
      };
      const declared = node({ actionEffect: { effectClass: "state", repeatSafe: true } });
      const runtime = new AutomationStudioNativeNodeRuntime().register(manifest([declared]), { packageId: "example.package", packageVersion: "1.0.0", implementations: { transform: implementation } });
      const trace = await runAutomationStudioGraph(effectFlow({ id: "apply", definitionId: declared.id, metadata: { effect: "observe", idempotent: true, declaredConsequences: lasting ? ["modify_existing"] : [] } }), {
        ...automationStudioRunGraphOptions({ signal: new AbortController().signal, authorizedDomainIds: [], nativeNodeRuntime: runtime }),
        delay: async () => undefined
      });
      expect(calls).toBe(lasting ? 1 : 3);
      expect(trace.status).toBe(lasting ? "failed" : "succeeded");
      expect(trace.failure?.code).toBe(lasting ? "run.outcome_uncertain" : undefined);
    }
  });

  it("refreshes conditional floors on each For Each pass in both true/false orders", async () => {
    for (const order of [[true, false], [false, true]]) {
      const dispatched: boolean[] = [];
      let observationFailures = 0;
      const declared = node({ actionEffect: { effectClass: "observe", commitWhen: "submit" }, parameters: [{ id: "submit", label: "Submit", valueType: "boolean", defaultValue: false }] });
      const implementation = ({ parameters }: AutomationStudioNativeNodeContext): AutomationNodeExecutionResult => {
        const submit = parameters.submit === true;
        dispatched.push(submit);
        if (submit && order[0] === false) throw new Error("Network error.");
        if (!submit && observationFailures++ < 2) return { status: "failed", route: "failed", outputs: {}, message: "Network error." };
        return { outputs: {} };
      };
      const runtime = new AutomationStudioNativeNodeRuntime().register(manifest([declared]), { packageId: "example.package", packageVersion: "1.0.0", implementations: { transform: implementation } });
      const options = automationStudioRunGraphOptions({ signal: new AbortController().signal, authorizedDomainIds: [], nativeNodeRuntime: runtime });
      const seen: Array<string | undefined> = [];
      const resolver = options.resolveActionEffect!;
      options.resolveActionEffect = (instance, values) => {
        const effect = resolver(instance, values);
        if (instance.definitionId === declared.id && values) seen.push(effect?.effectClass);
        return effect;
      };
      const flow: AutomationStudioFlowDocument = {
        ...effectFlow({ id: "list", definitionId: "builtin.data.constant", parameterValues: { value: order } }),
        nodes: [
          { id: "list", definitionId: "builtin.data.constant", parameterValues: { value: order } },
          { id: "each", definitionId: "builtin.control.for-each" },
          { id: "apply", definitionId: declared.id, parameterValues: { submit: automationNodeStateBinding("each.item") }, metadata: { effect: "observe", idempotent: true, declaredConsequences: [] } },
          { id: "end", definitionId: "builtin.control.end" }
        ],
        edges: [
          { id: "list-each", sourceNodeId: "list", sourcePortId: "success", targetNodeId: "each", targetPortId: "in" },
          { id: "items", sourceNodeId: "list", sourcePortId: "value", targetNodeId: "each", targetPortId: "items" },
          { id: "body", sourceNodeId: "each", sourcePortId: "body", targetNodeId: "apply", targetPortId: "in" },
          { id: "again", sourceNodeId: "apply", sourcePortId: "success", targetNodeId: "each", targetPortId: "in" },
          { id: "done", sourceNodeId: "each", sourcePortId: "done", targetNodeId: "end", targetPortId: "in" }
        ]
      };
      const trace = await runAutomationStudioGraph(flow, { ...options, delay: async () => undefined });
      expect(dispatched).toEqual(order[0] ? [true, false, false, false] : [false, false, false, true]);
      expect(seen).toEqual(dispatched.map((submit) => submit ? "commit" : "observe"));
      expect(trace.status).toBe(order[0] ? "succeeded" : "failed");
      expect(trace.failure?.code).toBe(order[0] ? undefined : "run.outcome_uncertain");
    }
  });

  it("settles canonical graph commits as landed or not-landed and retains all unacted retries", async () => {
    for (const settlement of ["landed", "not_landed", "unknown", "unacted"] as const) {
      const implementation = vi.fn((): AutomationNodeExecutionResult => ({ status: "failed", route: "failed", outputs: {}, failure: { category: "action_failed", code: "example.failed", retryable: true, stage: "execution", ...(settlement === "unacted" ? { effect: "unacted" } : {}) } }));
      const runtime = new AutomationStudioNativeNodeRuntime().register(manifest([node({ actionEffect: { effectClass: "commit" } })]), { packageId: "example.package", packageVersion: "1.0.0", implementations: { transform: implementation } });
      const trace = await runAutomationStudioGraph(effectFlow({ id: "apply", definitionId: "example.transform", metadata: { effect: "observe", idempotent: true } }), {
        ...automationStudioRunGraphOptions({ signal: new AbortController().signal, authorizedDomainIds: [], nativeNodeRuntime: runtime }),
        hostRuntime: { capabilities: [], actLanded: () => settlement === "unacted" ? "unknown" : settlement },
        delay: async () => undefined
      });
      expect(implementation).toHaveBeenCalledTimes(settlement === "not_landed" || settlement === "unacted" ? 4 : 1);
      expect(trace.status).toBe(settlement === "landed" ? "succeeded" : "failed");
      expect(trace.failure?.code).toBe(settlement === "unknown" ? "run.outcome_uncertain" : undefined);
    }
  });

  it("holds a native generic throw and timeout despite model observe/idempotency claims", async () => {
    for (const timesOut of [false, true]) {
      const implementation = vi.fn(() => {
        if (timesOut) return new Promise<never>(() => undefined);
        throw new Error("Lost reply.");
      });
      const runtime = new AutomationStudioNativeNodeRuntime().register(manifest([node({ actionEffect: { effectClass: "commit" } })]), { packageId: "example.package", packageVersion: "1.0.0", implementations: { transform: implementation } });
      const trace = await runAutomationStudioGraph(effectFlow({ id: "apply", definitionId: "example.transform", metadata: { effect: "observe", idempotent: true, declaredConsequences: [], timeoutMs: 10 } }), {
        ...automationStudioRunGraphOptions({ signal: new AbortController().signal, authorizedDomainIds: [], nativeNodeRuntime: runtime }),
        delay: async () => undefined
      });
      expect(implementation).toHaveBeenCalledTimes(1);
      expect(trace.failure?.code).toBe("run.outcome_uncertain");
      expect(trace.attempts[0]?.effectCheck?.result).toBe("unknown");
    }
  });

  it("raises the direct native host context and preserves grant/version refusals as unacted", async () => {
    const classes: unknown[] = [];
    const implementation = vi.fn(({ host }: AutomationStudioNativeNodeContext) => {
      classes.push(host?.sideEffectClass);
      return { outputs: {} };
    });
    const declared = node({ actionEffect: { effectClass: "commit" } });
    const runtime = new AutomationStudioNativeNodeRuntime().register(manifest([declared]), { packageId: "example.package", packageVersion: "1.0.0", implementations: { transform: implementation } });
    await runtime.execute({ id: "apply", definitionId: declared.id }, {}, undefined, { capabilityIds: [], sideEffectClass: "none" });
    await runtime.execute({ id: "apply", definitionId: declared.id }, {});
    expect(classes).toEqual(["external", "external"]);
    const mismatched = await runtime.execute({ id: "apply", definitionId: declared.id, definitionVersion: "2.0.0" }, {});
    expect(mismatched?.result.failure).toMatchObject({ effect: "unacted", stage: "dispatch" });
    const denied = new AutomationStudioNativeNodeRuntime().register(manifest([node({ actionEffect: { effectClass: "commit" }, safety: { requiredPermissions: ["example.write"] } })]), { packageId: "example.package", packageVersion: "1.0.0", implementations: { transform: implementation } });
    expect((await denied.execute({ id: "apply", definitionId: declared.id }, {}))?.result.failure).toMatchObject({ effect: "unacted", stage: "dispatch" });
    expect(implementation).toHaveBeenCalledTimes(2);
  });

  it("never dispatches a successful commit again when host verification rejects it", async () => {
    const implementation = vi.fn(() => ({ outputs: { result: 1 } }));
    const runtime = new AutomationStudioNativeNodeRuntime().register(manifest([node({ actionEffect: { effectClass: "commit" } })]), { packageId: "example.package", packageVersion: "1.0.0", implementations: { transform: implementation } });
    const trace = await runAutomationStudioGraph(effectFlow({ id: "apply", definitionId: "example.transform", parameterValues: { expectedState: { conditions: [{ path: "ready", expected: true }] } }, metadata: { effect: "observe", idempotent: true } }), {
      ...automationStudioRunGraphOptions({ signal: new AbortController().signal, authorizedDomainIds: [], nativeNodeRuntime: runtime }),
      hostRuntime: { capabilities: ["expectation-evaluation"], expectationEvaluator: () => ({ passed: false, checkedConditionCount: 1 }) },
      delay: async () => undefined
    });
    expect(implementation).toHaveBeenCalledTimes(1);
    expect(trace.status).toBe("failed");
    expect(trace.attempts[0]?.failure?.stage).toBe("verification");
    expect(trace.failure?.code).not.toBe("run.outcome_uncertain");
  });

  it("resolves registered policy outputs and unions all matching canonical floors", async () => {
    const definitions = [
      node({ id: "example.reader", actionEffect: { effectClass: "observe" }, outputAction: { fixedOutputId: "example.apply" } }),
      node({ id: "example.writer", actionEffect: { effectClass: "commit", permissionConsequences: ["modify_existing"] }, outputAction: { fixedOutputId: "example.apply" } })
    ];
    const runtime = new AutomationStudioNativeNodeRuntime().register(manifest(definitions), { packageId: "example.package", packageVersion: "1.0.0", implementations: { transform: () => ({ outputs: {} }) } });
    const dispatch = vi.fn(() => { throw new Error("Lost reply."); });
    const io = new IoRegistry();
    io.registerOutput("example", defineOutput({ definition: { id: "example.apply", title: "Apply" }, mode: "request", dispatch }));
    const options = automationStudioRunGraphOptions({ signal: new AbortController().signal, authorizedDomainIds: ["example"], nativeNodeRuntime: runtime, io: { io, domainId: "example" } });
    const instance: AutomationStudioFlowNode = { id: "apply", definitionId: "builtin.policy.action", parameterValues: { outputId: "example.apply", parameters: {} }, metadata: { effect: "observe", idempotent: true, declaredConsequences: [] } };
    expect(options.resolveActionEffect?.(instance)).toEqual({ effectClass: "commit", permissionConsequences: ["modify_existing"] });
    const trace = await runAutomationStudioGraph(effectFlow(instance), { ...options, delay: async () => undefined });
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(trace.failure?.code).toBe("run.outcome_uncertain");
    const unknown: AutomationStudioFlowNode = { ...instance, parameterValues: { outputId: "example.unregistered", parameters: {} } };
    expect(options.resolveActionEffect?.(unknown)).toBeUndefined();
    expect((await runAutomationStudioGraph(effectFlow(unknown), { ...options, delay: async () => undefined })).status).toBe("failed");
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it("raises an emitted output floor before its dispatcher throws even when the native node declared none", async () => {
    const emitter = node({ id: "example.emitter", source: { kind: "importer", domainId: "example", packageId: "example.package", implementationKey: "emit" }, outputAction: { fixedOutputId: "example.apply" } });
    const floor = node({ id: "example.floor", actionEffect: { effectClass: "commit" }, outputAction: { fixedOutputId: "example.apply" } });
    const emit = vi.fn(() => ({ outputs: {}, effects: [{ type: "policy.output.dispatch", payload: { outputId: "example.apply", parameters: {} } }] }));
    const dispatch = vi.fn(() => { throw new Error("Network error."); });
    const runtime = new AutomationStudioNativeNodeRuntime().register(manifest([emitter, floor]), { packageId: "example.package", packageVersion: "1.0.0", implementations: { emit, transform: () => ({ outputs: {} }) } });
    const trace = await runAutomationStudioGraph(effectFlow({ id: "apply", definitionId: emitter.id, metadata: { effect: "observe", idempotent: true } }), {
      ...automationStudioRunGraphOptions({ signal: new AbortController().signal, authorizedDomainIds: [], nativeNodeRuntime: runtime }),
      effectDispatcher: dispatch,
      delay: async () => undefined
    });
    expect(emit).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(trace.failure?.code).toBe("run.outcome_uncertain");
  });

  it("preserves unresolved slots and specializes an actually resolved false conditional parameter", async () => {
    const declared = node({ actionEffect: { effectClass: "state", commitWhen: "apply" }, parameters: [{ id: "apply", label: "Apply", valueType: "boolean", defaultValue: false }] });
    const implementation = vi.fn(() => ({ outputs: {} }));
    const runtime = new AutomationStudioNativeNodeRuntime().register(manifest([declared]), { packageId: "example.package", packageVersion: "1.0.0", implementations: { transform: implementation } });
    for (const missing of [true, false]) {
      const options = automationStudioRunGraphOptions({ signal: new AbortController().signal, authorizedDomainIds: [], nativeNodeRuntime: runtime, inputs: missing ? {} : { apply: false } });
      const seen: Array<string | undefined> = [];
      const resolver = options.resolveActionEffect!;
      options.resolveActionEffect = (instance, values) => {
        const effect = resolver(instance, values);
        if (values) seen.push(effect?.effectClass);
        return effect;
      };
      const trace = await runAutomationStudioGraph(effectFlow({ id: "apply", definitionId: declared.id, parameterValues: { apply: automationNodeStateBinding("apply") } }), options);
      expect(seen[0]).toBe(missing ? "commit" : "state");
      expect(trace.status).toBe(missing ? "failed" : "succeeded");
      if (missing) {
        expect(trace.attempts[0]?.failure?.effect).toBe("unacted");
        expect(trace.failure?.code).not.toBe("run.outcome_uncertain");
      }
    }
    expect(implementation).toHaveBeenCalledTimes(1);
  });

  it("fails closed before invoking a native action when trusted lookup throws", async () => {
    const implementation = vi.fn(() => ({ outputs: {} }));
    const runtime = new AutomationStudioNativeNodeRuntime().register(manifest([node({ actionEffect: { effectClass: "commit" } })]), { packageId: "example.package", packageVersion: "1.0.0", implementations: { transform: implementation } });
    const options = automationStudioRunGraphOptions({ signal: new AbortController().signal, authorizedDomainIds: [], nativeNodeRuntime: runtime });
    options.resolveActionEffect = () => { throw new Error("Registry unavailable."); };
    const trace = await runAutomationStudioGraph(effectFlow({ id: "apply", definitionId: "example.transform" }), options);
    expect(trace.status).toBe("failed");
    expect(implementation).not.toHaveBeenCalled();
  });
});
