import { afterEach, describe, expect, it, vi } from "vitest";
import { appManifestDigest, canonicalAppManifest, verifyAppManifest } from "../../../apps.ts";
import { manifestContent, verifiedManifest } from "../../tests/fixtures.ts";

afterEach(() => vi.unstubAllGlobals());

describe("canonical app identity", () => {
  it("uses SHA-256 over canonical content, excluding only its own digest", async () => {
    const manifest = await verifiedManifest();
    expect(manifest.manifestDigest).toMatch(/^[a-f0-9]{64}$/u);
    expect(await verifyAppManifest(manifest)).toEqual({ ok: true, value: manifest });
    expect(await appManifestDigest({ ...manifest, manifestDigest: "d".repeat(64) })).toBe(manifest.manifestDigest);
    expect(await appManifestDigest({ ...manifest, packageDigest: "d".repeat(64) })).not.toBe(manifest.manifestDigest);
    expect(canonicalAppManifest(manifest)).not.toContain('"manifestDigest"');
    expect(canonicalAppManifest(manifest)).toContain('"packageDigest"');
  });

  it("canonicalizes declarative sets and JSON schema sets without changing ordered examples", async () => {
    const content = manifestContent();
    content.frontend.allowedOrigins.push("https://second.example");
    content.frontend.redirectUris.push("https://second.example/callback");
    content.requirements.runtimes.push("pipeline");
    content.requirements.callbacks.push({ id: "capture", kind: "browser-interaction" });
    content.operations[0]!.inputs = { type: ["object", "null"], properties: { a: { type: "string", enum: ["one", "two"] }, b: { type: "number" } }, required: ["a", "b"] };
    const reordered = structuredClone(content);
    reordered.frontend.allowedOrigins.reverse();
    reordered.frontend.redirectUris.reverse();
    reordered.requirements.runtimes.reverse();
    reordered.requirements.environments.reverse();
    reordered.requirements.callbacks.reverse();
    reordered.requestedGrants.reverse();
    const schema = reordered.operations[0]!.inputs;
    schema.type = ["null", "object"];
    schema.required = ["b", "a"];
    schema.properties!.a!.enum = ["two", "one"];
    for (const operation of reordered.operations) for (const grant of operation.requestedGrants) if (grant.capability === "automation.execute") grant.acts.reverse();
    reordered.operations.reverse();
    expect(canonicalAppManifest(reordered)).toBe(canonicalAppManifest(content));
    expect(await appManifestDigest(reordered)).toBe(await appManifestDigest(content));
    content.operations[0]!.inputs = { type: "string", examples: ["one", "two"] };
    reordered.operations.find(operation => operation.kind === "query")!.inputs = { type: "string", examples: ["two", "one"] };
    expect(await appManifestDigest(reordered)).not.toBe(await appManifestDigest(content));
  });

  it("refuses structurally valid content tampering and unsupported versions", async () => {
    const manifest = await verifiedManifest();
    for (const patch of [{ version: "1.2.1" }, { packageDigest: "d".repeat(64) }, { publisherId: "different-publisher" }, { updatePolicy: "pinned" }]) {
      expect(await verifyAppManifest({ ...manifest, ...patch })).toMatchObject({ ok: false, error: { code: "app.manifest_digest_mismatch" } });
    }
    expect(await verifyAppManifest({ ...manifest, schemaVersion: 2 })).toMatchObject({ ok: false, error: { code: "app.unsupported_version" } });
  });

  it("does not expose rejected content through parse or thrown canonical errors", async () => {
    const secret = "DO-NOT-RETURN-PRIVATE-CREDENTIAL";
    const invalid = { ...manifestContent(), [secret]: secret };
    expect(JSON.stringify(await verifyAppManifest(invalid))).not.toContain(secret);
    expect(() => canonicalAppManifest(invalid)).toThrow("The app manifest is not valid.");
    const hostile = { get schemaVersion() { throw new Error(secret); } };
    expect(JSON.stringify(await verifyAppManifest(hostile))).not.toContain(secret);
  });

  it("fails closed with safe diagnostics when Web Crypto is unavailable", async () => {
    const manifest = await verifiedManifest();
    vi.stubGlobal("crypto", undefined);
    expect(await verifyAppManifest(manifest)).toMatchObject({ ok: false, error: { code: "app.unavailable_crypto" } });
    await expect(appManifestDigest(manifest)).rejects.toThrow("Web Crypto is required");
  });

  it("sanitizes failures from the host crypto implementation", async () => {
    const manifest = await verifiedManifest();
    vi.stubGlobal("crypto", { subtle: { digest: () => Promise.reject(new Error("DO-NOT-ECHO")) } });
    expect(await verifyAppManifest(manifest)).toMatchObject({ ok: false, error: { code: "app.unavailable_crypto" } });
    await expect(appManifestDigest(manifest)).rejects.toThrow("Web Crypto is required");
  });
});
