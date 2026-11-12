import { describe, expect, it } from "vitest";
import { IoRegistry } from "../../../io/index.ts";
import { AutomationStudioNativeNodeRuntime } from "../../native-nodes/index.ts";
import { AutomationStudioRuntimeBundles } from "../index.ts";
import type { TrustedModuleBuildIdentity } from "../../build-identity/modules/index.ts";

const evidence = (domainId: string) => ({ domainId, tools: [], deniedEvidenceKeys: [], executeTool: async () => ({}) });
const manifest = (domainId: string) => ({ schemaVersion: "0.1" as const, sdkVersion: "0.1" as const, packageId: domainId, packageVersion: "1.0.0", domainId, nodes: [] });

describe("external mutation and fallback rebinding", () => {
  it("refuses changed evidence claims before selection or retained-view access", () => {
    const binding = evidence("device");
    const registry = new AutomationStudioRuntimeBundles();
    registry.register({ runtime: "device", domainId: "device", evidence: binding });
    const selected = registry.forRuntime("device")!;
    binding.domainId = "other";
    expect(() => registry.forRuntime("device")).toThrow("runtime_bundle.evidence_domain_mismatch");
    expect(() => registry.forDomain(null)).toThrow("runtime_bundle.evidence_domain_mismatch");
    expect(() => selected.evidence).toThrow("runtime_bundle.evidence_domain_mismatch");
    binding.domainId = "device";
    expect(selected.evidence).toBe(binding);
  });

  it("refuses native packs extended to another domain after registration", () => {
    const nodes = new AutomationStudioNativeNodeRuntime();
    const registry = new AutomationStudioRuntimeBundles();
    registry.register({ runtime: "device", domainId: "device", nodes });
    const selected = registry.forRuntime("device")!;
    nodes.register(manifest("foreign"), { packageId: "foreign", packageVersion: "1.0.0", implementations: {} });
    expect(() => registry.list()).toThrow("runtime_bundle.node_domain_mismatch");
    expect(() => selected.nodes).toThrow("runtime_bundle.node_domain_mismatch");
    expect(() => registry.register({ runtime: "other", domainId: "other" })).toThrow("runtime_bundle.node_domain_mismatch");
  });

  it("refuses conflicting fallback rebinds without replacing previous slots", () => {
    const oldEvidence = evidence("primary");
    const oldHost = { capabilities: [] };
    const registry = new AutomationStudioRuntimeBundles({ evidence: oldEvidence, host: oldHost });
    const host = { capabilities: [] };
    registry.register({ runtime: "device", domainId: "device", host });
    expect(() => { registry.fallback.evidence = evidence("device"); }).toThrow("runtime_bundle.duplicate_domain");
    expect(() => { registry.fallback.host = host; }).toThrow("runtime_bundle.shared_object");
    expect(() => { registry.fallback.runtime = "device"; }).toThrow("runtime_bundle.duplicate_runtime");
    expect(registry.fallback.evidence).toBe(oldEvidence);
    expect(registry.fallback.host).toBe(oldHost);
    expect(registry.fallback.runtime).toBeUndefined();
  });

  it("atomically rebinds related fallback slots and invalidates claims immediately", () => {
    const io = { io: new IoRegistry(), domainId: "primary" };
    const registry = new AutomationStudioRuntimeBundles({ evidence: evidence("primary"), io });
    const retained = registry.forDomain(null);
    expect(() => { registry.fallback.evidence = evidence("replacement"); }).toThrow("runtime_bundle.io_domain_mismatch");
    const replacement = evidence("replacement");
    const replacementIo = { io: io.io, domainId: "replacement" };
    registry.fallback.rebind({ evidence: replacement, io: replacementIo });
    expect(retained).toBe(registry.fallback);
    expect(retained.evidence).toBe(replacement);
    expect(retained.io).toBe(replacementIo);
    expect(() => registry.register({ runtime: "replacement", domainId: "replacement" })).toThrow("runtime_bundle.duplicate_domain");
    registry.register({ runtime: "primary", domainId: "primary" });
    replacementIo.domainId = "primary";
    expect(() => retained.io).toThrow("runtime_bundle.io_domain_mismatch");
  });

  it("validates and copies fallback provenance before initial binding or atomic replacement", () => {
    const identity: TrustedModuleBuildIdentity = { schema: 1, protocol: "fluxiq.module-build-identity.v1", moduleId: "primary", version: "1", normalization: "module-payload-v1", artifactDigest: "a".repeat(64), sourceInputsDigest: "b".repeat(64) };
    expect(() => new AutomationStudioRuntimeBundles({ nodesIdentity: {} as TrustedModuleBuildIdentity })).toThrow("Malformed trusted module build identity");
    const registry = new AutomationStudioRuntimeBundles({ nodesIdentity: identity });
    Object.assign(identity, { version: "2" });
    expect(registry.fallback.nodesIdentity?.version).toBe("1");
    expect(Object.isFrozen(registry.fallback.nodesIdentity)).toBe(true);
    const originalHost = registry.fallback.host;
    expect(() => registry.fallback.rebind({ host: { capabilities: [] }, nodesIdentity: {} as TrustedModuleBuildIdentity })).toThrow("Malformed trusted module build identity");
    expect(registry.fallback.host).toBe(originalHost);
    expect(registry.fallback.nodesIdentity?.version).toBe("1");
    registry.fallback.nodesIdentity = identity;
    Object.assign(identity, { version: "3" });
    expect(registry.fallback.nodesIdentity?.version).toBe("2");
    registry.fallback.runtime = "primary";
    registry.fallback.runtime = undefined;
    expect(registry.forRuntime("other")).toBe(registry.fallback);
  });
});
