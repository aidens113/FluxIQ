import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FluxIQ } from "fluxiq";
import { afterEach, describe, expect, it } from "vitest";
import { applyFluxIQHostModule, closeFluxIQWebRuntime, createFluxIQWebInstance, getFluxIQ, loadFluxIQHostModule, reloadFluxIQWebInstance, resolveFluxIQHostModulePath, resolveFluxIQWebHostRoot } from "../fluxiq";

const originalEnv = {
  FLUXIQ_ALLOW_FRAMEWORK_REPO_ROOT: process.env.FLUXIQ_ALLOW_FRAMEWORK_REPO_ROOT,
  FLUXIQ_CLIENT_GATEWAY_ENABLED: process.env.FLUXIQ_CLIENT_GATEWAY_ENABLED,
  FLUXIQ_DOMAIN_ID: process.env.FLUXIQ_DOMAIN_ID,
  FLUXIQ_HOST_DOMAIN: process.env.FLUXIQ_HOST_DOMAIN,
  FLUXIQ_HOST_MODULE: process.env.FLUXIQ_HOST_MODULE,
  FLUXIQ_HOST_ROOT: process.env.FLUXIQ_HOST_ROOT,
  FLUXIQ_IMPORTER_ROOT: process.env.FLUXIQ_IMPORTER_ROOT,
  FLUXIQ_ROOT: process.env.FLUXIQ_ROOT
};

afterEach(() => {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  delete (globalThis as typeof globalThis & { __fluxiqWebHostModule?: unknown }).__fluxiqWebHostModule;
});

/**
 * A directory that resolves `fluxiq` from node_modules as an importing
 * repository does, so a host written there goes through the package exports map.
 */
function importingRepositoryDir(): string {
  const dir = fileURLToPath(new URL("../../../node_modules/.cache/", import.meta.url));
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe("FluxIQ web host module loading", () => {
  it("returns null when no host module is configured", () => {
    delete process.env.FLUXIQ_HOST_MODULE;

    expect(resolveFluxIQHostModulePath()).toBeNull();
  });

  it("fails loudly when the configured host module is missing", () => {
    process.env.FLUXIQ_HOST_MODULE = path.join(os.tmpdir(), "missing-fluxiq-host-module.cjs");

    expect(() => resolveFluxIQHostModulePath()).toThrow("FLUXIQ_HOST_MODULE points to a missing file");
  });

  it("applies registerFluxIQHost from the configured host module", async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "fluxiq-host-module-"));
    const modulePath = path.join(root, "host.cjs");
    writeFileSync(modulePath, "module.exports.registerFluxIQHost = (fluxiq) => { fluxiq.__hostRegistered = 'named'; return fluxiq; };\n");
    process.env.FLUXIQ_HOST_MODULE = modulePath;
    await loadFluxIQHostModule();
    const fluxiq = FluxIQ.create({ rootDir: root });

    expect(applyFluxIQHostModule(fluxiq)).toBe(fluxiq);
    expect((fluxiq as unknown as { __hostRegistered?: string }).__hostRegistered).toBe("named");

    rmSync(root, { recursive: true, force: true });
  });

  it("applies a default export from the configured host module", async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "fluxiq-host-module-"));
    const modulePath = path.join(root, "host-default.cjs");
    writeFileSync(modulePath, "module.exports.default = (fluxiq) => { fluxiq.__hostRegistered = 'default'; };\n");
    process.env.FLUXIQ_HOST_MODULE = modulePath;
    await loadFluxIQHostModule();
    const fluxiq = FluxIQ.create({ rootDir: root });

    expect(applyFluxIQHostModule(fluxiq)).toBe(fluxiq);
    expect((fluxiq as unknown as { __hostRegistered?: string }).__hostRegistered).toBe("default");

    rmSync(root, { recursive: true, force: true });
  });

  it("refuses to apply a configured host module that has not been loaded", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "fluxiq-host-module-"));
    const modulePath = path.join(root, "host-unloaded.cjs");
    writeFileSync(modulePath, "module.exports.registerFluxIQHost = (fluxiq) => fluxiq;\n");
    process.env.FLUXIQ_HOST_MODULE = modulePath;

    expect(() => applyFluxIQHostModule(FluxIQ.create({ rootDir: root }))).toThrow("FLUXIQ_HOST_MODULE has not been loaded");

    rmSync(root, { recursive: true, force: true });
  });

  it("loads an ES module host that imports FluxIQ's public package exports", async () => {
    const root = mkdtempSync(path.join(importingRepositoryDir(), "fluxiq-esm-host-"));
    const modulePath = path.join(root, "host.mjs");
    writeFileSync(modulePath, [
      "import { AutomationStudioNativeNodeRuntime } from \"fluxiq/automation-studio\";",
      "export function registerFluxIQHost(fluxiq) {",
      "  fluxiq.programs.automationStudio.bindNativeNodeRuntime(new AutomationStudioNativeNodeRuntime());",
      "  return fluxiq;",
      "}",
      ""
    ].join("\n"));
    process.env.FLUXIQ_HOST_MODULE = modulePath;
    try {
      await loadFluxIQHostModule();
      const fluxiq = applyFluxIQHostModule(FluxIQ.create({ rootDir: root }));

      expect(fluxiq.programs.automationStudio.nativeRuntimeSummary().bound).toBe(true);
      await fluxiq.close();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("explains that a CommonJS host cannot require FluxIQ's ESM-only package exports", async () => {
    const root = mkdtempSync(path.join(importingRepositoryDir(), "fluxiq-cjs-host-"));
    const modulePath = path.join(root, "host.cjs");
    writeFileSync(modulePath, "require(\"fluxiq/automation-studio\");\nmodule.exports.registerFluxIQHost = (fluxiq) => fluxiq;\n");
    process.env.FLUXIQ_HOST_MODULE = modulePath;
    try {
      await expect(loadFluxIQHostModule()).rejects.toThrow("FluxIQ packages are ESM-only");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("uses the sole host-registered domain without relocating global web state", async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "fluxiq-domain-host-"));
    const modulePath = path.join(root, "host-domain.cjs");
    writeFileSync(modulePath, `
module.exports.registerFluxIQHost = (fluxiq) => {
  fluxiq.registerDomain({
    manifest: {
      id: 'example.domain',
      title: 'Example Domain',
      category: 'Tests',
      description: 'Domain registered by host.',
      icon: 'blocks'
    }
  });
};
`);
    process.env.FLUXIQ_IMPORTER_ROOT = root;
    process.env.FLUXIQ_HOST_MODULE = modulePath;
    delete process.env.FLUXIQ_DOMAIN_ID;
    delete process.env.FLUXIQ_HOST_DOMAIN;

    await loadFluxIQHostModule();
    const fluxiq = createFluxIQWebInstance();

    expect(fluxiq.activeDomainId).toBe("example.domain");
    expect(fluxiq.paths.data).toBe(path.join(root, ".fluxiq"));
    expect(fluxiq.paths.domainRoot).toBe(path.join(root, ".fluxiq", "domains", "example.domain"));
    expect(fluxiq.paths.domainPrograms).toBe(path.join(root, "domains", "example.domain", "programs"));

    rmSync(root, { recursive: true, force: true });
  });
});

describe("FluxIQ web runtime lifecycle", () => {
  it("closes the previous instance on reload and the active instance on owner shutdown", async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "fluxiq-web-lifecycle-"));
    process.env.FLUXIQ_IMPORTER_ROOT = root;
    process.env.FLUXIQ_CLIENT_GATEWAY_ENABLED = "false";
    const globalState = globalThis as typeof globalThis & { __fluxiqWebRuntime?: unknown };
    delete globalState.__fluxiqWebRuntime;
    const sigintListeners = process.listenerCount("SIGINT");
    const sigtermListeners = process.listenerCount("SIGTERM");
    try {
      const first = getFluxIQ();
      expect(process.listenerCount("SIGINT")).toBe(sigintListeners + 1);
      expect(process.listenerCount("SIGTERM")).toBe(sigtermListeners + 1);
      let firstCloseCount = 0;
      (first as any).close = async () => { firstCloseCount += 1; };
      const second = await reloadFluxIQWebInstance();
      expect(firstCloseCount).toBe(1);

      let secondCloseCount = 0;
      (second as any).close = async () => { secondCloseCount += 1; };
      await Promise.all([closeFluxIQWebRuntime(), closeFluxIQWebRuntime()]);
      expect(secondCloseCount).toBe(1);
      expect(process.listenerCount("SIGINT")).toBe(sigintListeners);
      expect(process.listenerCount("SIGTERM")).toBe(sigtermListeners);
    } finally {
      await closeFluxIQWebRuntime();
      delete globalState.__fluxiqWebRuntime;
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("lets the real web host module bind explicit reusable-context protection", async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "fluxiq-reusable-host-"));
    const modulePath = path.join(root, "host-reusable.cjs");
    writeFileSync(modulePath, `
module.exports.registerFluxIQHost = (fluxiq) => fluxiq.bindAutomationStudioReusableLlmContext({
  enabled: true,
  contentProtection: {
    providerId: 'host.test-protection.v1',
    seal: async ({ content }) => ({ content, encryption: '{"provider":"test"}' }),
    open: async ({ content }) => content
  },
  selectForFreshEvidence: async () => undefined
});
`);
    process.env.FLUXIQ_IMPORTER_ROOT = root;
    process.env.FLUXIQ_HOST_MODULE = modulePath;
    process.env.FLUXIQ_CLIENT_GATEWAY_ENABLED = "false";
    await loadFluxIQHostModule();
    const fluxiq = createFluxIQWebInstance();
    expect(fluxiq.programs.automationStudio.reusableLlmContextStatus()).toMatchObject({ enabled: true, writeEnabled: true, contentProtection: "host.test-protection.v1" });
    await fluxiq.close();
    rmSync(root, { recursive: true, force: true });
  });

  it("fails web runtime construction when host reusable-context configuration is malformed", async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "fluxiq-reusable-host-invalid-"));
    const modulePath = path.join(root, "host-reusable-invalid.cjs");
    writeFileSync(modulePath, `module.exports.registerFluxIQHost = (fluxiq) => fluxiq.bindAutomationStudioReusableLlmContext({ enabled: true, contentProtection: { providerId: '' } });\n`);
    process.env.FLUXIQ_IMPORTER_ROOT = root;
    process.env.FLUXIQ_HOST_MODULE = modulePath;
    await loadFluxIQHostModule();
    expect(() => createFluxIQWebInstance()).toThrow("host configuration is invalid");
    rmSync(root, { recursive: true, force: true });
  });
});
describe("FluxIQ web host root resolution", () => {
  it("prefers the explicit importer root", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "fluxiq-importer-root-"));
    process.env.FLUXIQ_IMPORTER_ROOT = root;

    expect(resolveFluxIQWebHostRoot(process.cwd())).toBe(path.resolve(root));

    rmSync(root, { recursive: true, force: true });
  });

  it("refuses to use a FluxIQ source checkout as implicit host storage", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "fluxiq-source-root-"));
    mkdirSync(path.join(root, "packages", "fluxiq", "src", "framework"), { recursive: true });
    mkdirSync(path.join(root, "apps", "web"), { recursive: true });
    writeFileSync(path.join(root, "pnpm-workspace.yaml"), "packages: []\n");
    writeFileSync(path.join(root, "packages", "fluxiq", "src", "framework", "index.ts"), "");
    writeFileSync(path.join(root, "apps", "web", "package.json"), "{}\n");
    delete process.env.FLUXIQ_IMPORTER_ROOT;
    delete process.env.FLUXIQ_HOST_ROOT;
    delete process.env.FLUXIQ_ROOT;
    delete process.env.FLUXIQ_ALLOW_FRAMEWORK_REPO_ROOT;

    expect(() => resolveFluxIQWebHostRoot(root)).toThrow("Refusing to use the FluxIQ framework source checkout");

    rmSync(root, { recursive: true, force: true });
  });
});
