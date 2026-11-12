import { describe, expect, it, vi } from "vitest";
import { AutomationStudioRuntimeBundles, AutomationStudioRuntimeFallbackGuard } from "../index.ts";

describe("project-authority fallback guard primitive", () => {
  it("keeps the single-runtime operation synchronous with zero lookup and raw identities", () => {
    const host = { capabilities: [] };
    const registry = new AutomationStudioRuntimeBundles({ host });
    const lookup = vi.fn(() => "foreign");
    const guard = new AutomationStudioRuntimeFallbackGuard(registry, lookup);
    for (const project of [undefined, null, "unknown"]) {
      expect(guard.run(project, (fallback) => fallback)).toBe(registry.fallback);
      expect(guard.run(project, (fallback) => fallback.host)).toBe(host);
    }
    expect(lookup).not.toHaveBeenCalled();
  });

  it("never dispatches foreign or unknown authority to fallback", async () => {
    const registry = new AutomationStudioRuntimeBundles();
    registry.register({ runtime: "device", domainId: "device" });
    const lookup = vi.fn((project: string) => project === "foreign" ? "device" : undefined);
    const guard = new AutomationStudioRuntimeFallbackGuard(registry, lookup);
    const operation = vi.fn();
    await expect(guard.run("foreign", operation)).rejects.toThrow("runtime_bundle.cross_domain_use");
    await expect(guard.run("missing", operation)).rejects.toThrow("runtime_bundle.project_authority_unknown");
    expect(() => guard.run(undefined, operation)).toThrow("runtime_bundle.project_authority_unknown");
    expect(() => guard.run("", operation)).toThrow("runtime_bundle.project_authority_unknown");
    expect(operation).not.toHaveBeenCalled();
  });

  it("permits known fallback and global projects, including explicit global null", async () => {
    const registry = new AutomationStudioRuntimeBundles();
    registry.register({ runtime: "device", domainId: "device" });
    const lookup = vi.fn((project: string) => project === "global" ? null : "primary");
    const guard = new AutomationStudioRuntimeFallbackGuard(registry, lookup);
    const operation = vi.fn((fallback) => fallback);
    expect(guard.run(null, operation)).toBe(registry.fallback);
    expect(lookup).not.toHaveBeenCalled();
    expect(await guard.run("global", operation)).toBe(registry.fallback);
    expect(await guard.run("primary", operation)).toBe(registry.fallback);
  });

  it("propagates failed lookup and checks current claims after async lookup", async () => {
    const registry = new AutomationStudioRuntimeBundles();
    registry.register({ runtime: "device", domainId: "device" });
    const operation = vi.fn();
    const failed = new AutomationStudioRuntimeFallbackGuard(registry, async () => { throw new Error("lookup failed"); });
    await expect(failed.run("p", operation)).rejects.toThrow("lookup failed");
    let resolve!: (domain: string) => void;
    const lookup = new Promise<string>((done) => { resolve = done; });
    const guard = new AutomationStudioRuntimeFallbackGuard(registry, () => lookup);
    const pending = guard.run("p", operation);
    registry.register({ runtime: "second", domainId: "second" });
    resolve("second");
    await expect(pending).rejects.toThrow("runtime_bundle.cross_domain_use");
    expect(operation).not.toHaveBeenCalled();
  });
});
