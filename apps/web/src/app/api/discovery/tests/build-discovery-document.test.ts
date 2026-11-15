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
    const built = buildDiscoveryDocument({ FLUXIQ_PROFILE: profile, FLUXIQ_PUBLIC_ORIGIN: "https://app.example.com" });
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
