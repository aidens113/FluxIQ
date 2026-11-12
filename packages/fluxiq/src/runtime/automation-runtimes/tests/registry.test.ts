import { describe, expect, it } from "vitest";
import { IoRegistry } from "../../../io/index.ts";
import { AutomationStudioNativeNodeRuntime } from "../../native-nodes/index.ts";
import { readTrustedModuleIdentities, type TrustedModuleBuildIdentity } from "../../build-identity/modules/index.ts";
import { AutomationStudioRuntimeBundles, type AutomationStudioRuntimeBundle } from "../index.ts";

const evidence = (domainId: string) => ({ domainId, tools: [], deniedEvidenceKeys: [], executeTool: async () => ({}) });
const host = () => ({ capabilities: [] });
const manifest = (domainId: string, packageId = domainId) => ({ schemaVersion: "0.1" as const, sdkVersion: "0.1" as const, packageId, packageVersion: "1.0.0", domainId, nodes: [] });
const nodes = (domainId: string) => new AutomationStudioNativeNodeRuntime().register(manifest(domainId), { packageId: domainId, packageVersion: "1.0.0", implementations: {} });
const bundle = (runtime = "device", domainId = "sim.device"): AutomationStudioRuntimeBundle => ({ runtime, domainId, evidence: evidence(domainId), host: host(), nodes: nodes(domainId) });

describe("runtime bundle registry foundation", () => {
  it("preserves all fallback object identities and synchronous selection", () => {
    const initial = { evidence: evidence("primary"), host: host(), nodes: nodes("primary"), io: { io: new IoRegistry(), domainId: "primary" } };
    const registry = new AutomationStudioRuntimeBundles(initial);
    for (const domain of [null, "primary", "unclaimed"]) {
      const view = registry.forDomain(domain);
      expect(view).toBe(registry.fallback);
      for (const key of ["evidence", "host", "nodes", "io"] as const) expect(view[key]).toBe(initial[key]);
    }
    expect(registry.multiple).toBe(false);
    expect(registry.list()).toEqual([registry.fallback]);
    expect(registry.forRuntime("anything")).toBe(registry.fallback);
  });

  it("selects claimed runtimes first and makes an explicit fallback runtime strict", () => {
    const registry = new AutomationStudioRuntimeBundles();
    registry.register(bundle());
    const selected = registry.forDomain("sim.device");
    expect(registry.forRuntime("device")).toBe(selected);
    expect(registry.forRuntime("other")).toBe(registry.fallback);
    expect(registry.list()).toEqual([registry.fallback, selected]);
    registry.fallback.runtime = "primary";
    expect(registry.forRuntime("other")).toBeUndefined();
    expect(registry.forRuntime("primary")).toBe(registry.fallback);
    expect(registry.forRuntime("device")).toBe(selected);
  });

  it.each([
    ["duplicate_domain", { domainId: "sim.device", evidence: evidence("sim.device"), nodes: nodes("sim.device") }],
    ["duplicate_runtime", { runtime: "device" }],
    ["evidence_domain_mismatch", { evidence: evidence("foreign") }],
    ["node_domain_mismatch", { nodes: nodes("foreign") }],
    ["invalid_runtime", { runtime: "BAD" }],
    ["invalid_domain", { domainId: " " }]
  ])("refuses %s atomically and leaves the candidate runtime free", (code, patch) => {
    const registry = new AutomationStudioRuntimeBundles();
    registry.register(bundle());
    expect(() => registry.register({ ...bundle("second", "sim.second"), ...patch })).toThrow(`runtime_bundle.${code}`);
    expect(registry.list()).toHaveLength(2);
    expect(registry.forDomain("sim.second")).toBe(registry.fallback);
    registry.register(bundle("second", "sim.second"));
    expect(registry.list()).toHaveLength(3);
  });

  it("refuses fallback runtime/domain claims and all shared host/node identities", () => {
    const initial = { runtime: "primary", evidence: evidence("primary"), io: { io: new IoRegistry(), domainId: "primary" }, host: host(), nodes: nodes("primary") };
    const registry = new AutomationStudioRuntimeBundles(initial);
    expect(() => registry.register(bundle("device", "primary"))).toThrow("runtime_bundle.duplicate_domain");
    expect(() => registry.register(bundle("primary"))).toThrow("runtime_bundle.duplicate_runtime");
    expect(() => registry.register({ ...bundle(), host: initial.host })).toThrow("runtime_bundle.shared_object");
    // Empty node packs isolate identity refusal from the independent domain mismatch check.
    const emptyNodes = new AutomationStudioNativeNodeRuntime();
    const other = new AutomationStudioRuntimeBundles({ nodes: emptyNodes });
    expect(() => other.register({ ...bundle(), nodes: emptyNodes })).toThrow("runtime_bundle.shared_object");
    const first = { ...bundle(), nodes: new AutomationStudioNativeNodeRuntime() };
    registry.register(first);
    expect(() => registry.register({ ...bundle("second", "sim.second"), host: first.host })).toThrow("runtime_bundle.shared_object");
    expect(() => registry.register({ ...bundle("second", "sim.second"), nodes: first.nodes })).toThrow("runtime_bundle.shared_object");
    expect(registry.list()).toHaveLength(2);
  });

  it("owns immutable selection metadata and copied provenance without cloning implementations", () => {
    const identity: TrustedModuleBuildIdentity = { schema: 1, protocol: "fluxiq.module-build-identity.v1", moduleId: "device", version: "1", normalization: "module-payload-v1", artifactDigest: "a".repeat(64), sourceInputsDigest: "b".repeat(64) };
    const original = { ...bundle(), nodesIdentity: identity };
    const registry = new AutomationStudioRuntimeBundles();
    registry.register(original);
    const selected = registry.forRuntime("device")!;
    original.runtime = "changed";
    original.domainId = "changed";
    original.host = host();
    Object.assign(identity, { version: "2" });
    expect(selected.runtime).toBe("device");
    expect(selected.domainId).toBe("sim.device");
    expect(selected.evidence).toBe(original.evidence);
    expect(selected.host).not.toBe(original.host);
    expect(selected.nodes).toBe(original.nodes);
    expect(Object.isFrozen(selected)).toBe(true);
    expect(Object.isFrozen(registry.list())).toBe(true);
    expect(readTrustedModuleIdentities(selected)).toEqual([{ ...identity, version: "1" }]);
    expect(selected.nodesIdentity?.version).toBe("1");
  });

  it("does not partially register malformed provenance", () => {
    const registry = new AutomationStudioRuntimeBundles();
    expect(() => registry.register({ ...bundle(), nodesIdentity: {} as TrustedModuleBuildIdentity })).toThrow("Malformed trusted module build identity");
    expect(registry.multiple).toBe(false);
    registry.register(bundle());
    expect(registry.forRuntime("device")?.domainId).toBe("sim.device");
  });

  it("accepts a dual-role implementation within one owner but rejects reuse by another owner", () => {
    const implementation = Object.assign(new AutomationStudioNativeNodeRuntime(), { capabilities: [] });
    const fallback = new AutomationStudioRuntimeBundles({ host: implementation, nodes: implementation });
    expect(fallback.fallback.host).toBe(implementation);
    expect(fallback.fallback.nodes).toBe(implementation);
    expect(() => fallback.register({ runtime: "other", domainId: "other", nodes: implementation })).toThrow("runtime_bundle.shared_object");
    const registry = new AutomationStudioRuntimeBundles();
    registry.register({ runtime: "device", domainId: "device", host: implementation, nodes: implementation });
    expect(registry.forRuntime("device")?.nodes).toBe(implementation);
    expect(() => registry.register({ runtime: "other", domainId: "other", host: implementation })).toThrow("runtime_bundle.shared_object");
  });

  it("reserves the fallback IO domain independently of an evidence binding", () => {
    const registry = new AutomationStudioRuntimeBundles({ io: { io: new IoRegistry(), domainId: "primary" } });
    expect(() => registry.register({ runtime: "device", domainId: "primary" })).toThrow("runtime_bundle.duplicate_domain");
    expect(registry.multiple).toBe(false);
  });
});
