import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { FluxIQ } from "fluxiq";
import { afterEach, describe, expect, it } from "vitest";
import { applyFluxIQHostModule, createFluxIQWebInstance, resolveFluxIQHostModulePath, resolveFluxIQWebHostRoot } from "./fluxiq";

const originalEnv = {
  FLUXIQ_ALLOW_FRAMEWORK_REPO_ROOT: process.env.FLUXIQ_ALLOW_FRAMEWORK_REPO_ROOT,
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
});

describe("FluxIQ web host module loading", () => {
  it("returns null when no host module is configured", () => {
    delete process.env.FLUXIQ_HOST_MODULE;

    expect(resolveFluxIQHostModulePath()).toBeNull();
  });

  it("fails loudly when the configured host module is missing", () => {
    process.env.FLUXIQ_HOST_MODULE = path.join(os.tmpdir(), "missing-fluxiq-host-module.cjs");

    expect(() => resolveFluxIQHostModulePath()).toThrow("FLUXIQ_HOST_MODULE points to a missing file");
  });

  it("applies registerFluxIQHost from the configured host module", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "fluxiq-host-module-"));
    const modulePath = path.join(root, "host.cjs");
    writeFileSync(modulePath, "module.exports.registerFluxIQHost = (fluxiq) => { fluxiq.__hostRegistered = 'named'; return fluxiq; };\n");
    process.env.FLUXIQ_HOST_MODULE = modulePath;
    const fluxiq = FluxIQ.create({ rootDir: root });

    expect(applyFluxIQHostModule(fluxiq)).toBe(fluxiq);
    expect((fluxiq as unknown as { __hostRegistered?: string }).__hostRegistered).toBe("named");

    rmSync(root, { recursive: true, force: true });
  });

  it("applies a default export from the configured host module", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "fluxiq-host-module-"));
    const modulePath = path.join(root, "host-default.cjs");
    writeFileSync(modulePath, "module.exports.default = (fluxiq) => { fluxiq.__hostRegistered = 'default'; };\n");
    process.env.FLUXIQ_HOST_MODULE = modulePath;
    const fluxiq = FluxIQ.create({ rootDir: root });

    expect(applyFluxIQHostModule(fluxiq)).toBe(fluxiq);
    expect((fluxiq as unknown as { __hostRegistered?: string }).__hostRegistered).toBe("default");

    rmSync(root, { recursive: true, force: true });
  });

  it("uses the sole host-registered domain without relocating global web state", () => {
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

    const fluxiq = createFluxIQWebInstance();

    expect(fluxiq.activeDomainId).toBe("example.domain");
    expect(fluxiq.paths.data).toBe(path.join(root, ".fluxiq"));
    expect(fluxiq.paths.domainRoot).toBe(path.join(root, ".fluxiq", "domains", "example.domain"));
    expect(fluxiq.paths.domainPrograms).toBe(path.join(root, "domains", "example.domain", "programs"));

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
