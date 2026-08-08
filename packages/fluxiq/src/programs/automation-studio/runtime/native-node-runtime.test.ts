import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowDocument } from "../model/index.ts";
import { AUTOMATION_STUDIO_IMPORTER_SDK_VERSION, type AutomationStudioImporterSdkManifest, type AutomationStudioNodeDefinition } from "../nodes/index.ts";
import { runAutomationStudioGraph } from "./executor.ts";
import { AutomationStudioNativeNodeRuntime } from "./native-node-runtime.ts";

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
