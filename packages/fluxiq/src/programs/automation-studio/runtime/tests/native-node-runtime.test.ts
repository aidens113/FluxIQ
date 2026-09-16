import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowDocument } from "../../model/index.ts";
import { AUTOMATION_STUDIO_IMPORTER_SDK_VERSION, type AutomationStudioImporterSdkManifest, type AutomationStudioNodeDefinition } from "../../nodes/index.ts";
import type { AutomationStudioRunDatasetSummary } from "@fluxiq/contracts/automation-studio";
import type { AutomationStudioRecordBatch } from "../executor/index.ts";
import { runAutomationStudioGraph } from "../executor.ts";
import { validateAutomationStudioFlowBootstrapPlan, type AutomationStudioFlowBootstrapPlan } from "../flow-bootstrap/index.ts";
import { AutomationStudioNativeNodeRuntime } from "../native-node-runtime.ts";

function node(overrides: Partial<AutomationStudioNodeDefinition> = {}): AutomationStudioNodeDefinition {
  return {
    schemaVersion: "0.1", id: "example.transform", version: "1.0.0", label: "Transform", description: "Importer transform", category: "custom",
    source: { kind: "importer", domainId: "example", packageId: "example.package", implementationKey: "transform" }, availability: { kind: "domain", domainId: "example" },
    capabilities: { executable: true, codeBacked: true }, inputs: [{ id: "in", label: "In", valueType: "number" }], outputs: [{ id: "result", label: "Result", valueType: "number" }], parameters: [], ...overrides
  };
}
function manifest(nodes = [node()]): AutomationStudioImporterSdkManifest { return { schemaVersion: "0.1", sdkVersion: AUTOMATION_STUDIO_IMPORTER_SDK_VERSION, packageId: "example.package", packageVersion: "1.0.0", domainId: "example", nodes }; }

describe("trusted-local native node runtime", () => {
  it("registers manifests and isolates implementation inputs to declared ports", async () => {
    let received: Record<string, unknown> = {};
    const runtime = new AutomationStudioNativeNodeRuntime().register(manifest(), { packageId: "example.package", packageVersion: "1.0.0", implementations: { transform: ({ inputs, log }) => { received = inputs; log({ level: "info", message: "done", data: { token: "secret", visible: "yes" } }); return { outputs: { result: Number(inputs.in) * 2 } }; } } });
    const flow: AutomationStudioFlowDocument = { schemaVersion: "0.1", flowId: "flow.native", ownerKind: "policy", ownerId: "flow.native", name: "Native", nodes: [{ id: "native", definitionId: "example.transform" }], edges: [], createdAt: 1, updatedAt: 1 };
    const trace = await runAutomationStudioGraph(flow, { inputs: { in: 4, ambientSecret: "must-not-cross" }, nativeNodeExecutor: ({ node: instance, inputs, signal }) => runtime.execute(instance, inputs, signal) });
    expect(trace.status).toBe("succeeded"); expect(trace.values.result).toBe(8); expect(received).toEqual({ in: 4 });
    expect(trace.attempts[0]?.logs).toEqual([{ level: "info", message: "done", data: { token: "[REDACTED]", visible: "yes" } }]);
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
    await expect(runtime.execute({ id: "native", definitionId: "example.transform", metadata: { timeoutMs: 10 } }, {})).resolves.toMatchObject({ result: { status: "failed", outputs: { error: expect.stringContaining("exceeded 10ms") } } });
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
