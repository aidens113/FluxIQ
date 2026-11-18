import { describe, expect, it } from "vitest";
import { parseAppManifest } from "../../../apps.ts";
import { manifestFixture } from "../../tests/fixtures.ts";

describe("app manifest structure", () => {
  it("parses the complete pinned app without granting publisher authority", () => {
    expect(parseAppManifest(manifestFixture())).toEqual({ ok: true, value: manifestFixture() });
    expect(parseAppManifest({ ...manifestFixture(), publisherVerified: true }).ok).toBe(false);
  });

  it.each([0, 2, -1])("refuses unsupported version %s safely", schemaVersion => {
    expect(parseAppManifest({ ...manifestFixture(), schemaVersion })).toMatchObject({ ok: false, error: { code: "app.unsupported_version" } });
  });

  it("requires a real version, digests, update policy and exact known fields", () => {
    const manifest = manifestFixture();
    for (const patch of [{ version: "latest" }, { version: "01.0.0" }, { packageDigest: "sha256:invalid" }, { manifestDigest: "F".repeat(64) }, { updatePolicy: "auto-grant" }, { workspaceId: "body-authority" }, { privateKey: "hidden" }]) {
      expect(parseAppManifest({ ...manifest, ...patch }).ok).toBe(false);
    }
  });

  it("rejects duplicate operations, callbacks and requested capability bindings", () => {
    const manifest = manifestFixture();
    expect(parseAppManifest({ ...manifest, operations: [...manifest.operations, manifest.operations[0]] }).ok).toBe(false);
    expect(parseAppManifest({ ...manifest, requestedGrants: [...manifest.requestedGrants, manifest.requestedGrants[0]] }).ok).toBe(false);
    expect(parseAppManifest({ ...manifest, requirements: { ...manifest.requirements, callbacks: [{ id: "same", kind: "server" }, { id: "same", kind: "local-worker" }] } }).ok).toBe(false);
  });

  it("requires declared operation grants and a runtime for execution", () => {
    const manifest = manifestFixture();
    expect(parseAppManifest({ ...manifest, requestedGrants: [] }).ok).toBe(false);
    expect(parseAppManifest({ ...manifest, requirements: { ...manifest.requirements, runtimes: [] } }).ok).toBe(false);
    expect(parseAppManifest({ ...manifest, operations: [manifest.operations[0]], requirements: { ...manifest.requirements, runtimes: [] } }).ok).toBe(true);
  });

  it("rejects unsupported JSON Schema keywords through the existing parser", () => {
    const manifest = manifestFixture();
    const operation = manifest.operations[0]!;
    expect(parseAppManifest({ ...manifest, operations: [{ ...operation, inputs: { type: "string", pattern: "unsafe" } }] }).ok).toBe(false);
  });
});

describe("app frontend registrations", () => {
  it.each([
    "http://app.example", "https://*.example", "https://app.example/", "https://user:password@app.example", "https://app.example/path", "null", "file://app.example"
  ])("refuses an inappropriate or non-exact origin %s", origin => {
    const manifest = manifestFixture();
    expect(parseAppManifest({ ...manifest, frontend: { ...manifest.frontend, allowedOrigins: [origin] } }).ok).toBe(false);
  });

  it.each([
    "https://other.example/callback", "https://user:password@app.example/callback", "https://app.example/callback#fragment", "javascript:alert(1)", "https://app.example/*", "http://app.example/callback"
  ])("refuses an unregistered or unsafe redirect %s", redirect => {
    const manifest = manifestFixture();
    expect(parseAppManifest({ ...manifest, frontend: { ...manifest.frontend, redirectUris: [redirect] } }).ok).toBe(false);
  });

  it("requires an explicit loopback development mode even for HTTP localhost", () => {
    const manifest = manifestFixture();
    const frontend = { mode: "production", entryUrl: "http://localhost:5173/", allowedOrigins: ["http://localhost:5173"], redirectUris: ["http://localhost:5173/callback"] };
    expect(parseAppManifest({ ...manifest, frontend }).ok).toBe(false);
    expect(parseAppManifest({ ...manifest, frontend: { ...frontend, mode: "loopback-development" } }).ok).toBe(true);
  });

  it("keeps loopback frontend mode independent of explicitly declared cloud execution", () => {
    const manifest = manifestFixture();
    manifest.frontend = { mode: "loopback-development", entryUrl: "http://127.0.0.1:5173/", allowedOrigins: ["http://127.0.0.1:5173"], redirectUris: ["http://127.0.0.1:5173/callback"] };
    manifest.requirements.environments = ["cloud"];
    expect(parseAppManifest(manifest).ok).toBe(true);
    expect(parseAppManifest({ ...manifest, frontend: { ...manifest.frontend, entryUrl: "http://remote.example/", allowedOrigins: ["http://remote.example"], redirectUris: ["http://remote.example/callback"] } }).ok).toBe(false);
  });

  it("requires the frontend entry and every redirect origin to be registered", () => {
    const manifest = manifestFixture();
    expect(parseAppManifest({ ...manifest, frontend: { ...manifest.frontend, entryUrl: "https://other.example/" } }).ok).toBe(false);
    expect(parseAppManifest({ ...manifest, frontend: { ...manifest.frontend, allowedOrigins: [] } }).ok).toBe(false);
    expect(parseAppManifest({ ...manifest, frontend: { ...manifest.frontend, allowedOrigins: ["https://app.example", "https://app.example"] } }).ok).toBe(false);
  });
});
