import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FluxIQ } from "../../../../framework/index.ts";
import { getPlatformRegistry, resetPlatformRegistryForTests } from "../../registry/index.ts";
import { applyHostInstanceRegistrations, loadPlatformHostModules, loadedHostModulesStore, parseHostModulePaths, type HostInstanceRegistration } from "../index.ts";

const FIXTURE = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "tests", "fixtures", "fixture-host-module.mjs");
const globals = globalThis as { __fluxiqFixtureHookLog?: unknown[]; __fluxiqOrder?: string[] };
let tmp = "";

beforeEach(() => {
  resetPlatformRegistryForTests();
  loadedHostModulesStore.clear();
  delete globals.__fluxiqFixtureHookLog;
  delete globals.__fluxiqOrder;
  tmp = mkdtempSync(path.join(os.tmpdir(), "fluxiq-host-modules-"));
});
afterEach(() => rmSync(tmp, { recursive: true, force: true }));

describe("parseHostModulePaths", () => {
  it("trims, drops empties, resolves and de-duplicates", () => {
    expect(parseHostModulePaths(undefined)).toEqual([]);
    expect(parseHostModulePaths(" , ")).toEqual([]);
    expect(parseHostModulePaths(" a.mjs , ,b.mjs,a.mjs")).toEqual([path.resolve("a.mjs"), path.resolve("b.mjs")]);
  });
});

describe("loadPlatformHostModules", () => {
  it("loads the fixture: registers the platform side and collects the instance side", async () => {
    const loaded = await loadPlatformHostModules({ value: FIXTURE });
    expect(loaded.paths).toEqual([path.resolve(FIXTURE)]);
    expect(loaded.instanceRegistrations).toHaveLength(1);
    const registry = getPlatformRegistry();
    expect(registry.product()?.id).toBe("fixture");
    expect(registry.emailTemplates().welcome?.subject).toContain("Welcome");
    await registry.emit("account.created", { accountId: "a1", userId: "u", workspaceId: "w" });
    expect(globals.__fluxiqFixtureHookLog).toEqual([{ event: "account.created", accountId: "a1" }]);
  });
  it("loads modules in order and applies instance registrations in that order", async () => {
    const second = path.join(tmp, "second.mjs");
    writeFileSync(
      second,
      [
        'export function registerFluxIQPlatform(p) { p.registerEmailTemplate("password-reset", { subject: "s", text: "t" }); }',
        'export default function (fluxiq) { (globalThis.__fluxiqOrder ??= []).push("second"); return fluxiq; }',
        ""
      ].join("\n")
    );
    const loaded = await loadPlatformHostModules({ value: `${FIXTURE},${second}` });
    expect(loaded.paths).toEqual([path.resolve(FIXTURE), path.resolve(second)]);
    expect(loaded.instanceRegistrations).toHaveLength(2);
    expect(getPlatformRegistry().emailTemplates()["password-reset"]).toEqual({ subject: "s", text: "t" });
    const instance = { id: "base" } as unknown as FluxIQ;
    expect(applyHostInstanceRegistrations(instance, loaded.instanceRegistrations)).toBe(instance);
    expect(globals.__fluxiqOrder).toEqual(["second"]);
  });
  it("is idempotent for the same list and refuses a different one", async () => {
    const first = await loadPlatformHostModules({ value: FIXTURE });
    const again = await loadPlatformHostModules({ value: FIXTURE });
    expect(again).toBe(first);
    await getPlatformRegistry().emit("account.created", { accountId: "a", userId: "u", workspaceId: "w" });
    expect(globals.__fluxiqFixtureHookLog).toHaveLength(1);
    await expect(loadPlatformHostModules({ value: `${FIXTURE},${path.join(tmp, "x.mjs")}` })).rejects.toThrow(/different list/u);
  });
  it("names a missing file", async () => {
    const missing = path.join(tmp, "missing.mjs");
    await expect(loadPlatformHostModules({ value: missing })).rejects.toThrow(missing);
  });
  it("shares an in-flight load so concurrent callers register the platform once", async () => {
    let registrations = 0;
    const input = {
      value: FIXTURE,
      importModule: async () => {
        await Promise.resolve();
        return {
          registerFluxIQPlatform: () => { registrations += 1; }
        };
      }
    };
    const [first, second] = await Promise.all([loadPlatformHostModules(input), loadPlatformHostModules(input)]);
    expect(first).toBe(second);
    expect(registrations).toBe(1);
  });
  it("retains a failed load instead of repeating partial registrations", async () => {
    let imports = 0;
    const error = new Error("startup failed");
    const input = {
      value: FIXTURE,
      importModule: async () => {
        imports += 1;
        throw error;
      }
    };
    await expect(loadPlatformHostModules(input)).rejects.toBe(error);
    await expect(loadPlatformHostModules(input)).rejects.toBe(error);
    expect(imports).toBe(1);
  });
  it("uses an injected importer and the default-object fallback", async () => {
    const seen: string[] = [];
    const loaded = await loadPlatformHostModules({
      value: FIXTURE,
      importModule: async (modulePath) => {
        seen.push(modulePath);
        return { default: { registerFluxIQHost: () => undefined } };
      }
    });
    expect(seen).toEqual([path.resolve(FIXTURE)]);
    expect(loaded.instanceRegistrations).toHaveLength(1);
  });
});

describe("applyHostInstanceRegistrations", () => {
  it("threads a replacement instance and refuses an asynchronous registration", () => {
    const a = { id: "a" } as unknown as FluxIQ;
    const b = { id: "b" } as unknown as FluxIQ;
    const seen: unknown[] = [];
    expect(applyHostInstanceRegistrations(a, [() => b, (current) => void seen.push(current)])).toBe(b);
    expect(seen).toEqual([b]);
    expect(() => applyHostInstanceRegistrations(a, [(() => Promise.resolve(a)) as unknown as HostInstanceRegistration])).toThrow(/synchronous/u);
  });
});
