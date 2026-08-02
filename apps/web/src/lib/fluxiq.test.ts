import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { resolveFluxIQWebHostRoot } from "./fluxiq";

const originalEnv = {
  FLUXIQ_ALLOW_FRAMEWORK_REPO_ROOT: process.env.FLUXIQ_ALLOW_FRAMEWORK_REPO_ROOT,
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
