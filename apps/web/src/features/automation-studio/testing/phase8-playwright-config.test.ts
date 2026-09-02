import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Phase 8 Playwright project contract", () => {
  const source = readFileSync(resolve(process.cwd(), "playwright.config.ts"), "utf8");
  const certificationRunbook = readFileSync(
    resolve(process.cwd(), "../../docs/operations/web-panel-responsive-visual-certification.md"),
    "utf8",
  );
  const packageJson = JSON.parse(readFileSync(resolve(process.cwd(), "package.json"), "utf8")) as {
    scripts?: Record<string, string>;
  };

  it("generates all three browser engines across all four certified viewports", () => {
    expect(source).toContain('id: "chromium"');
    expect(source).toContain('id: "edge"');
    expect(source).toContain('channel: "msedge"');
    expect(source).toContain('id: "firefox"');
    for (const viewport of ["desktop", "short-tablet", "mobile", "zoom-200"]) {
      expect(source).toContain(`id: "${viewport}"`);
    }
    expect(source).toContain("browserProfiles.flatMap");
  });

  it("keeps server startup outside Playwright", () => {
    expect(source).not.toContain("webServer:");
    expect(source).not.toContain("pnpm dev");
  });

  it("uses a Windows-safe Phase 8 test matcher", () => {
    expect(packageJson.scripts?.["test:e2e:phase8"]).toContain("playwright test phase8-");
    expect(packageJson.scripts?.["test:e2e:phase8:chromium"]).toContain("playwright test phase8-");
    expect(packageJson.scripts?.["test:e2e:phase8:cross-browser"]).toContain("playwright test phase8-");
    expect(Object.values(packageJson.scripts ?? {})).not.toContain(expect.stringContaining("phase8-*.spec.ts"));
  });

  it("serializes owned-host certification and leaves enough time for multi-route evidence capture", () => {
    for (const name of ["test:e2e:phase8", "test:e2e:phase8:chromium", "test:e2e:phase8:cross-browser"]) {
      expect(packageJson.scripts?.[name]).toContain("--workers=1");
      expect(packageJson.scripts?.[name]).toContain("--timeout=180000");
    }
  });

  it("defines and documents the production host required for normalized performance certification", () => {
    expect(packageJson.scripts?.start).toBe("next start --hostname 127.0.0.1");
    expect(packageJson.scripts?.["test:e2e:phase8:performance"]).toBe(
      "playwright test phase8-performance-certification.spec.ts --workers=1 --timeout=180000 --project=desktop-chromium",
    );
    expect(certificationRunbook).toContain("pnpm --filter @fluxiq/web build");
    expect(certificationRunbook).toContain("pnpm --filter @fluxiq/web start");
    expect(certificationRunbook).toContain('$env:FLUXIQ_E2E_BUILD_MODE = "production"');
    expect(certificationRunbook).toContain('$env:FLUXIQ_E2E_NORMALIZED = "true"');
    expect(certificationRunbook).toContain("test:e2e:phase8:performance");
  });
});
