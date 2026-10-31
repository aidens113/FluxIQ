import { describe, expect, it } from "vitest";
import { AUTOMATION_STUDIO_IMPORTER_SDK_VERSION, type AutomationStudioNodeDefinition } from "../../../../nodes/index.ts";
import { AutomationStudioNativeNodeRuntime } from "../../../native-node-runtime.ts";
import { automationStudioLlmPriorNodesRuntimeAuthority } from "../authority.ts";
import { automationStudioLlmPriorNodesIdentity } from "../identity.ts";
import type { AutomationStudioLlmRerunRecord, AutomationStudioLlmRerunScope } from "../../rerun-provenance/index.ts";

const node = (id: string, actionEffect: AutomationStudioNodeDefinition["actionEffect"]): AutomationStudioNodeDefinition => ({
  schemaVersion: "0.1", id, version: "1.0.0", label: "Read catalogue", description: "Read the catalogue.", category: "data",
  source: { kind: "importer", domainId: "catalogue", packageId: "catalogue.nodes", implementationKey: id }, availability: { kind: "domain", domainId: "catalogue" },
  capabilities: { executable: true, codeBacked: true }, inputs: [], outputs: [], parameters: [], ...(actionEffect ? { actionEffect } : {})
});

function runtime() {
  const definitions = [node("catalogue.read", { effectClass: "observe" }), { ...node("catalogue.apply", { effectClass: "commit" }), outputAction: { fixedOutputId: "catalogue.save" } }];
  return new AutomationStudioNativeNodeRuntime().register({ schemaVersion: "0.1", sdkVersion: AUTOMATION_STUDIO_IMPORTER_SDK_VERSION, packageId: "catalogue.nodes", packageVersion: "1.0.0", domainId: "catalogue", nodes: definitions }, {
    packageId: "catalogue.nodes", packageVersion: "1.0.0", implementations: Object.fromEntries(definitions.map((definition) => [definition.id, () => ({ status: "success" as const, route: "done", outputs: {} })]))
  });
}

describe("live NativeRuntime prior-call authority", () => {
  it("reads registered canonical effects and policy-output composition, refusing unknown inputs", () => {
    const native = runtime();
    const port = automationStudioLlmPriorNodesRuntimeAuthority({ runtime: () => native, binding: () => native, generation: {}, authority: {}, scope: { kind: "domain", domainId: "catalogue" } });
    expect(port.resolve("catalogue.read", {}, {})).toMatchObject({ definitionId: "catalogue.read", definitionVersion: "1.0.0", effect: { effectClass: "observe" } });
    expect(port.resolve("catalogue.missing", {}, {})).toBeUndefined();
    expect(port.resolve("catalogue.read", {}, { unaccounted: true })).toBeUndefined();
    expect(port.resolve("builtin.policy.action", { outputId: "catalogue.save", parameters: {} }, {})?.effect.effectClass).toBe("commit");
  });

  it("changes private scope identity on live registry/runtime/binding changes and cancellation", () => {
    let native = runtime(), binding: object = {};
    const signal = new AbortController();
    const port = automationStudioLlmPriorNodesRuntimeAuthority({ runtime: () => native, binding: () => binding, generation: {}, authority: {}, scope: { kind: "domain", domainId: "catalogue" }, signal: signal.signal });
    const first = port.currentScope()!;
    expect(port.currentScope()!.registry).toBe(first.registry);
    native.sdk.nodes.register(node("catalogue.new", { effectClass: "observe" }));
    const added = port.currentScope()!;
    expect(added.registry).not.toBe(first.registry);
    native = runtime();
    expect(port.currentScope()!.registry).not.toBe(added.registry);
    binding = {};
    expect(port.currentScope()!.binding).not.toBe(first.binding);
    signal.abort();
    expect(port.currentScope()).toBeUndefined();
    expect(port.resolve("catalogue.read", {}, {})).toBeUndefined();
  });

  it("uses stable opaque subject/resource identities and the original reference instant", () => {
    const identity = automationStudioLlmPriorNodesIdentity();
    const scope: AutomationStudioLlmRerunScope = { loop: {}, binding: {}, generation: {}, registry: {}, authority: {} };
    const record = { subject: { privateResource: "resource" }, referenceNow: 10 } as unknown as AutomationStudioLlmRerunRecord;
    const first = identity.original(record, scope);
    expect(identity.original(record, { ...scope })).toBe(first);
    expect(identity.original({ ...record, subject: { privateResource: "resource" } }, scope)).not.toBe(first);
    expect(identity.original({ ...record, referenceNow: 11 }, scope)).not.toBe(first);
    expect(identity.original(record, { ...scope, binding: {} })).not.toBe(first);
    expect(first).toMatch(/^[a-f0-9]{64}$/u);
    expect(first).not.toContain("resource");
  });
});
