import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveFluxIQDeploymentSettings } from "fluxiq/platform/profile";
import { isOwnerClaimOpen, ownerClaimPaths, prepareOwnerClaim, readSetupCode, setupCodeMatches } from "../index";

// Every code here is a dummy value.
const PUBLIC = { FLUXIQ_PUBLIC_ORIGIN: "https://fluxiq.example.test" };

let fluxiqDir: string;

beforeEach(async () => {
  fluxiqDir = await mkdtemp(path.join(os.tmpdir(), "fluxiq-prepare-claim-"));
});

afterEach(async () => {
  await rm(fluxiqDir, { recursive: true, force: true });
});

function settings(env: Record<string, string> = {}) {
  return resolveFluxIQDeploymentSettings({ FLUXIQ_PROFILE: "self-hosted", ...PUBLIC, ...env });
}

describe("prepareOwnerClaim", () => {
  it("generates a 160-bit code, owner-readable only, kept across restarts", async () => {
    const first = await prepareOwnerClaim({ settings: settings(), fluxiqDir });
    const { generatedCode } = ownerClaimPaths(fluxiqDir);
    expect(first).toEqual({ claimed: false, codeFile: generatedCode });
    const code = (await readFile(generatedCode, "utf8")).trim();
    expect(code).toMatch(/^[0-9a-f]{40}$/u);
    if (process.platform !== "win32") expect((await stat(generatedCode)).mode & 0o777).toBe(0o600);
    expect(await prepareOwnerClaim({ settings: settings({ FLUXIQ_PROFILE: "service" }), fluxiqDir })).toEqual(first);
    expect((await readFile(generatedCode, "utf8")).trim()).toBe(code);
    expect(await readSetupCode(settings(), fluxiqDir)).toBe(code);
    expect(await isOwnerClaimOpen(settings(), fluxiqDir)).toBe(true);
  });

  it("honours FLUXIQ_SETUP_CODE_FILE and never writes a generated code beside it", async () => {
    const codeFile = path.join(fluxiqDir, "operator-code.txt");
    await writeFile(codeFile, "  operator-chosen-dummy-code-123  \n");
    const configured = settings({ FLUXIQ_SETUP_CODE_FILE: codeFile });
    expect(await prepareOwnerClaim({ settings: configured, fluxiqDir })).toEqual({ claimed: false, codeFile });
    await expect(stat(ownerClaimPaths(fluxiqDir).generatedCode)).rejects.toMatchObject({ code: "ENOENT" });
    expect(await readSetupCode(configured, fluxiqDir)).toBe("operator-chosen-dummy-code-123");
  });

  it("refuses a FLUXIQ_SETUP_CODE_FILE under 16 characters without echoing it", async () => {
    const codeFile = path.join(fluxiqDir, "short-code.txt");
    await writeFile(codeFile, "short-dummy\n");
    const configured = settings({ FLUXIQ_SETUP_CODE_FILE: codeFile });
    const refused = await prepareOwnerClaim({ settings: configured, fluxiqDir }).then(() => null, (error: Error) => error);
    expect(refused?.message).toMatch(/at least 16 characters/u);
    expect(refused?.message).not.toContain("short-dummy");
    // The submit fails closed on it too, rather than reading it as "no code".
    await expect(readSetupCode(configured, fluxiqDir)).rejects.toThrow(/at least 16 characters/u);
    const missing = settings({ FLUXIQ_SETUP_CODE_FILE: path.join(fluxiqDir, "absent.txt") });
    await expect(prepareOwnerClaim({ settings: missing, fluxiqDir })).rejects.toThrow(/could not be read/u);
  });

  it("does nothing on local, which keeps the admin/admin first start", async () => {
    const local = resolveFluxIQDeploymentSettings({});
    expect(await prepareOwnerClaim({ settings: local, fluxiqDir })).toEqual({ claimed: false, codeFile: null });
    await expect(stat(ownerClaimPaths(fluxiqDir).generatedCode)).rejects.toMatchObject({ code: "ENOENT" });
    expect(await isOwnerClaimOpen(local, fluxiqDir)).toBe(false);
  });

  it("reports claimed once the marker exists and removes a generated code left behind", async () => {
    await prepareOwnerClaim({ settings: settings(), fluxiqDir });
    const paths = ownerClaimPaths(fluxiqDir);
    await writeFile(paths.marker, JSON.stringify({ schemaVersion: 1, claimedAt: "2026-10-29T00:00:00.000Z", ownerUserId: "owner" }));
    expect(await prepareOwnerClaim({ settings: settings(), fluxiqDir })).toEqual({ claimed: true, codeFile: null });
    await expect(stat(paths.generatedCode)).rejects.toMatchObject({ code: "ENOENT" });
    expect(await isOwnerClaimOpen(settings(), fluxiqDir)).toBe(false);
  });
});

describe("setupCodeMatches", () => {
  it("compares the trimmed code by digest", () => {
    expect(setupCodeMatches("  dummy-code-0123456789 ", "dummy-code-0123456789")).toBe(true);
    expect(setupCodeMatches("dummy-code-0123456788", "dummy-code-0123456789")).toBe(false);
    expect(setupCodeMatches("dummy", "dummy-code-0123456789")).toBe(false);
  });
});
