import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CoreRuntimeBuildIdentity } from "fluxiq/runtime";
import { readCoreRuntimeBuildIdentity } from "fluxiq/runtime";
import { parseFluxIQDiscoveryDocument } from "../../../../lib/request-guard";
import { buildDiscoveryDocument } from "../build-discovery-document";

vi.mock("fluxiq/runtime", () => ({ readCoreRuntimeBuildIdentity: vi.fn() }));

const identity: CoreRuntimeBuildIdentity = {
  schema: 1,
  protocol: "fluxiq.core-runtime-identity.v1",
  version: "0.49.0-experiment.1",
  normalization: "reader-payload-v1",
  artifactDigest: "a".repeat(64),
  artifacts: { "runtime/index.js": "b".repeat(64) }
};

beforeEach(() => vi.mocked(readCoreRuntimeBuildIdentity).mockReturnValue(identity));

describe("discovery runtime provenance", () => {
  it("publishes the configured SDK audience identity and rejects invalid ids", () => {
    const value = buildDiscoveryDocument({ FLUXIQ_INSTANCE_ID: "production-1" });
    expect(value.ok && value.document).toMatchObject({ instance: { id: "production-1" } });
    expect(buildDiscoveryDocument({ FLUXIQ_INSTANCE_ID: "bad#id" })).toEqual({ ok: false, fields: ["instance.id"] });
  });
  it.each(["local", "self-hosted", "service"])("publishes executing artifact identity in %s", (profile) => {
    const built = buildDiscoveryDocument({ FLUXIQ_PROFILE: profile, FLUXIQ_PUBLIC_ORIGIN: "https://app.example.com", FLUXIQ_INSTANCE_ID: "production-1" });
    expect(built.ok).toBe(true);
    if (!built.ok) throw new Error("discovery build refused valid deployment");
    const parsed = parseFluxIQDiscoveryDocument(built.document, "https://app.example.com");
    expect(parsed.success).toBe(true);
    if (!parsed.success) throw parsed.error;
    expect(parsed.data.runtime).toEqual({ schema: 1, protocol: identity.protocol, version: identity.version, artifactDigest: identity.artifactDigest });
    expect(parsed.data.protocols.clientGateway).toEqual(["0.1", "0.2"]);
    expect(parsed.data.minimumClient).toEqual({ "browser-extension": "0.1.0" });
    expect(JSON.stringify(built.document)).not.toContain("runtime/index.js");
  });

  it("omits provenance when the reader has no stamped identity", () => {
    vi.mocked(readCoreRuntimeBuildIdentity).mockReturnValue(null);
    const built = buildDiscoveryDocument({});
    expect(built.ok).toBe(true);
    if (!built.ok) throw new Error("discovery build refused local deployment");
    expect(built.document).not.toHaveProperty("runtime");
  });

  it("refuses invalid digest metadata instead of publishing a placeholder", () => {
    vi.mocked(readCoreRuntimeBuildIdentity).mockReturnValue({ ...identity, artifactDigest: "placeholder" });
    expect(buildDiscoveryDocument({})).toEqual({ ok: false, fields: ["runtime.artifactDigest"] });
  });
});

describe("explicit discovery connection flows", () => {
  it.each([
    ["local", "true", false, true],
    ["local", "false", false, false],
    ["self-hosted", "true", false, true],
    ["self-hosted", "false", false, false],
    ["service", "true", true, false],
    ["service", "false", false, false]
  ])("advertises actual connection support for %s with gateway enabled=%s", (profile, enabled, authorizationCodePkce, gatewayReferencePairing) => {
    const built = buildDiscoveryDocument({ FLUXIQ_PROFILE: String(profile), FLUXIQ_PUBLIC_ORIGIN: "https://app.example.com", FLUXIQ_CLIENT_GATEWAY_ENABLED: String(enabled), FLUXIQ_INSTANCE_ID: "production-1" });
    expect(built.ok).toBe(true);
    if (!built.ok) throw new Error("Discovery refused valid profile settings.");
    const parsed = parseFluxIQDiscoveryDocument(built.document, "https://app.example.com");
    expect(parsed.success).toBe(true);
    if (!parsed.success) throw new Error("Discovery refused the explicit connect flow document.");
    expect(parsed.data.connect.flows).toEqual({ authorizationCodePkce, referenceCode: false, gatewayReferencePairing });
    expect(parsed.data.connect).toMatchObject({ authorizeUrl: "/connect/authorize", tokenUrl: "/api/connect/token", revokeUrl: "/api/connect/revoke", codeEntryUrl: "/connect" });
    expect(parsed.data.fluxiqDiscoveryVersion).toBe(1);
    expect(parsed.data.protocols.clientGateway).toEqual(["0.1", "0.2"]);
  });
});

describe("service discovery instance identity", () => {
  it.each([undefined, "", " \t\n", "bad#synthetic.secret"])("refuses missing, blank or invalid configured service identity: %j", (instanceId) => {
    const built = buildDiscoveryDocument({ FLUXIQ_PROFILE: "service", FLUXIQ_PUBLIC_ORIGIN: "https://app.example.com", FLUXIQ_INSTANCE_ID: instanceId, FLUXIQ_INSTANCE_NAME: "synthetic.private.name" });
    expect(built).toEqual({ ok: false, fields: ["instance.id"] });
    expect(JSON.stringify(built)).not.toContain("synthetic.");
  });

  it("requires service identity even when the gateway is disabled", () => {
    expect(buildDiscoveryDocument({ FLUXIQ_PROFILE: "service", FLUXIQ_PUBLIC_ORIGIN: "https://app.example.com", FLUXIQ_CLIENT_GATEWAY_ENABLED: "false" })).toEqual({ ok: false, fields: ["instance.id"] });
  });

  it("advertises the same derived identity key sessions use on the local profile", () => {
    const env = { FLUXIQ_PROFILE: "local", FLUXIQ_PUBLIC_ORIGIN: "https://app.example.com" };
    const built = buildDiscoveryDocument(env);
    if (!built.ok) throw new Error("Local discovery refused a derived instance identity.");
    expect(built.document).toMatchObject({ instance: { id: expect.stringMatching(/^local-[0-9a-f]{16}$/u) } });
  });

  it("lets self-hosted discovery omit instance identity", () => {
    const built = buildDiscoveryDocument({ FLUXIQ_PROFILE: "self-hosted", FLUXIQ_PUBLIC_ORIGIN: "https://app.example.com" });
    expect(built.ok).toBe(true);
    if (!built.ok) throw new Error("Self-hosted discovery refused an optional instance identity.");
    expect(built.document).not.toHaveProperty("instance.id");
  });

  it("keeps the configured service identity stable across different executing builds", () => {
    const env = { FLUXIQ_PROFILE: "service", FLUXIQ_PUBLIC_ORIGIN: "https://app.example.com", FLUXIQ_INSTANCE_ID: " production-1 " };
    const first = buildDiscoveryDocument(env);
    vi.mocked(readCoreRuntimeBuildIdentity).mockReturnValue({ ...identity, version: "0.50.0", artifactDigest: "c".repeat(64) });
    const second = buildDiscoveryDocument(env);
    expect(first.ok && first.document).toMatchObject({ instance: { id: "production-1" }, runtime: { version: identity.version } });
    expect(second.ok && second.document).toMatchObject({ instance: { id: "production-1" }, runtime: { version: "0.50.0" } });
  });
});
