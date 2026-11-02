import { describe, expect, it, vi } from "vitest";
import { createElementMatcher } from "../../target-matching/index.ts";
import { resolveAutomationStudioNodeActionEffect, type AutomationNodeExecutionResult, type AutomationStudioNodeDefinition } from "../../../components/automation/index.ts";
import { AUTOMATION_STUDIO_IMPORTER_SDK_VERSION, type AutomationStudioImporterSdkManifest, type AutomationStudioNativeNodeContext } from "../../../components/automation/importer/index.ts";
import { AutomationStudioNativeNodeRuntime } from "../index.ts";
function node(overrides: Partial<AutomationStudioNodeDefinition> = {}): AutomationStudioNodeDefinition {
  return {
    schemaVersion: "0.1", id: "example.transform", version: "1.0.0", label: "Transform", description: "Importer transform", category: "custom",
    source: { kind: "importer", domainId: "example", packageId: "example.package", implementationKey: "transform" }, availability: { kind: "domain", domainId: "example" },
    capabilities: { executable: true, codeBacked: true }, inputs: [{ id: "in", label: "In", valueType: "number" }], outputs: [{ id: "result", label: "Result", valueType: "number" }], parameters: [], ...overrides
  };
}
function manifest(nodes = [node()]): AutomationStudioImporterSdkManifest {
  return { schemaVersion: "0.1", sdkVersion: AUTOMATION_STUDIO_IMPORTER_SDK_VERSION, packageId: "example.package", packageVersion: "1.0.0", domainId: "example", nodes };
}
describe("trusted-local native node runtime", () => {
  it("normalizes native target controls without changing actual outputs/logs or reading authored metadata", async () => {
    let reads = 0;
    const accessor = Object.defineProperty({ outputs: { result: 7 } }, "actionability", {
      enumerable: true,
      get: () => {
        reads += 1;
        return { actionable: true };
      }
    });
    const answers: AutomationNodeExecutionResult[] = [
      { outputs: { result: 7 }, actionability: { actionable: false, cause: "hidden" } },
      { outputs: { result: 7 } }, accessor
    ];
    const runtime = new AutomationStudioNativeNodeRuntime().register(manifest(), {
      packageId: "example.package", packageVersion: "1.0.0",
      implementations: {
        transform: ({ log }) => {
          log({ level: "info", message: "actual native execution" });
          return answers.shift()!;
        }
      }
    });
    const instance = { id: "native", definitionId: "example.transform", metadata: { actionability: { actionable: true } } };
    const measured = await runtime.execute(instance, {});
    expect(measured).toMatchObject({ result: { outputs: { result: 7 }, actionability: { actionable: false, cause: "hidden" } }, logs: [{ message: "actual native execution" }] });
    for (let index = 0; index < 2; index += 1) {
      const unobserved = await runtime.execute(instance, {});
      expect(unobserved?.result.outputs).toEqual({ result: 7 });
      expect(unobserved?.result).not.toHaveProperty("actionability");
      expect(unobserved?.logs).toHaveLength(1);
    }
    expect(reads).toBe(0);
    expect(Object.getOwnPropertyDescriptor(accessor, "actionability")?.get).toBeTypeOf("function");
  });
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
  it("provides the registered domain matcher to native implementations", async () => {
    const domainMatcher = createElementMatcher();
    const runtime = new AutomationStudioNativeNodeRuntime().register(manifest(), {
      elementMatcher: domainMatcher,
      packageId: "example.package",
      packageVersion: "1.0.0",
      implementations: {
        transform: ({ elementMatcher }) => {
          expect(elementMatcher).toBe(domainMatcher);
          const best = elementMatcher.bestCandidate({ visibleText: "Save", id: "save" }, [{ candidateId: "wrong", visibleText: "Cancel" }, { candidateId: "right", visibleText: "Save", id: "save" }]);
          return { outputs: { result: best?.candidateId === "right" ? 1 : 0 } };
        }
      }
    });
    await expect(runtime.execute({ id: "native", definitionId: "example.transform" }, {})).resolves.toMatchObject({ result: { outputs: { result: 1 } } });
  });
  it("fails closed when an importer asks to score targets without a registered matcher", async () => {
    const runtime = new AutomationStudioNativeNodeRuntime().register(manifest(), {
      packageId: "example.package", packageVersion: "1.0.0",
      implementations: { transform: ({ elementMatcher }) => ({ outputs: { result: elementMatcher.bestCandidate({ label: "Save" }, [{ candidateId: "save", label: "Save" }]) ? 1 : 0 } }) }
    });
    expect(runtime.getElementMatcher("example")).toBeUndefined();
    await expect(runtime.execute({ id: "native", definitionId: "example.transform" }, {})).resolves.toMatchObject({ result: { status: "failed", outputs: { error: expect.stringContaining("No element matcher is registered for domain example") } } });
  });
  it("keeps registered matchers isolated by domain and refuses conflicting registrations", () => {
    const first = createElementMatcher();
    const second = createElementMatcher({ weights: { entityId: 100 } });
    const runtime = new AutomationStudioNativeNodeRuntime().register(manifest([]), { packageId: "example.package", packageVersion: "1.0.0", implementations: {}, elementMatcher: first });
    const other = { ...manifest([]), domainId: "other", packageId: "other.package" };
    runtime.register(other, { packageId: other.packageId, packageVersion: "1.0.0", implementations: {}, elementMatcher: second });
    expect(runtime.getElementMatcher("example")).toBe(first);
    expect(runtime.getElementMatcher("other")).toBe(second);
    expect(runtime.getElementMatcher("unregistered")).toBeUndefined();
    expect(() => runtime.domainElementMatcher("unregistered").bestCandidate({ entityId: "record" }, [{ candidateId: "record", entityId: "record" }])).toThrow("No element matcher is registered for domain unregistered");
    expect(() => runtime.register({ ...manifest([]), packageId: "conflicting.package" }, { packageId: "conflicting.package", packageVersion: "1.0.0", implementations: {}, elementMatcher: second })).toThrow("A different element matcher is already registered for domain example");
    expect(runtime.getElementMatcher("example")).toBe(first);
  });
  it("provides registered target resolvers to native implementations", async () => {
    const withResolver = { ...manifest(), targetResolvers: [{ id: "element", version: "1.0.0", description: "Resolves element targets" }] };
    const matcher = createElementMatcher();
    const runtime = new AutomationStudioNativeNodeRuntime().register(withResolver, {
      elementMatcher: matcher,
      packageId: "example.package",
      packageVersion: "1.0.0",
      implementations: {
        transform: async ({ resolveTarget }) => {
          const target = await resolveTarget("element", { selector: "#save" });
          return { outputs: { result: target?.kind === "element" ? 1 : 0 } };
        }
      },
      targetResolvers: {
        element: (target, context) => {
          expect(context.elementMatcher).toBe(matcher);
          return { kind: "element", fingerprint: { selector: String(target.selector ?? "") } };
        }
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
    const controller = new AbortController();
    const execution = runtime.execute({ id: "native", definitionId: "example.transform" }, {}, controller.signal);
    controller.abort();
    await expect(execution).resolves.toMatchObject({ result: { status: "failed" } });
  });
  it("rejects SDK version mismatches, missing implementations, and Code Node action forging", async () => {
    const invalid = { ...manifest(), sdkVersion: "9.0" as any };
    expect(() => new AutomationStudioNativeNodeRuntime().register(invalid, { packageId: "example.package", packageVersion: "1.0.0", implementations: { transform: () => ({}) } })).toThrow("version_mismatch");
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
  const contract = ({ value }: {
    value: unknown;
  }) => (value as {
    item?: unknown;
  }).item ? [] : ["example.items.missing_item"];
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
    const malformed = { ...bundle };
    Reflect.set(malformed, "parameterContracts", { "example.items": "check" });
    expect(() => notFunction.register(manifest([items]), malformed))
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
});
describe("canonical action effects in real native and policy dispatch paths", () => {
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
});
