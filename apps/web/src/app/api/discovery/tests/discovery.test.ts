import { afterEach, describe, expect, it, vi } from "vitest";
import { parseFluxIQDiscoveryDocument } from "../../../../lib/request-guard";
import { GET } from "../route";
import { buildDiscoveryDocument } from "../build-discovery-document";

afterEach(() => vi.unstubAllEnvs());

describe("GET /api/discovery", () => {
  it("serves a parsable document on the local profile", async () => {
    const response = GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("public, max-age=300");
    const document = await response.json();
    expect(parseFluxIQDiscoveryDocument(document, document.origin).success).toBe(true);
    expect(document.instance).toMatchObject({ name: "FluxIQ", profile: "local", id: expect.stringMatching(/^local-[0-9a-f]{16}$/u) });
    expect(document.minimumClient).toEqual({ "browser-extension": "0.1.0" });
    expect(document.connect.signUpUrl).toBeUndefined();
    expect(document.connect.flows).toEqual({ authorizationCodePkce: false, referenceCode: false, gatewayReferencePairing: true });
  });
  it("serves the service profile with its name and sign-up URL", async () => {
    vi.stubEnv("FLUXIQ_PROFILE", "service");
    vi.stubEnv("FLUXIQ_PUBLIC_ORIGIN", "https://app.getfluxiq.com");
    vi.stubEnv("FLUXIQ_INSTANCE_NAME", "FluxIQ Cloud");
    vi.stubEnv("FLUXIQ_INSTANCE_ID", "production-1");
    vi.stubEnv("FLUXIQ_SIGN_UP_URL", "https://getfluxiq.com/sign-up");
    const document = await GET().json();
    expect(parseFluxIQDiscoveryDocument(document, "https://app.getfluxiq.com").success).toBe(true);
    expect(document.instance.name).toBe("FluxIQ Cloud");
    expect(document.gatewayUrl.startsWith("wss:")).toBe(true);
    expect(document.connect.signUpUrl).toBe("https://getfluxiq.com/sign-up");
    expect(document.connect.flows).toEqual({ authorizationCodePkce: true, referenceCode: false, gatewayReferencePairing: false });
  });
  it.each([undefined, "", " \t\n", "bad#synthetic.secret"])("returns a safe non-cacheable refusal for invalid service identity: %j", async (instanceId) => {
    vi.stubEnv("FLUXIQ_PROFILE", "service");
    vi.stubEnv("FLUXIQ_PUBLIC_ORIGIN", "https://app.getfluxiq.com");
    vi.stubEnv("FLUXIQ_INSTANCE_ID", instanceId);
    vi.stubEnv("FLUXIQ_INSTANCE_NAME", "synthetic.private.name");
    const response = GET();
    expect(response.status).toBe(500);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await response.json();
    expect(body).toEqual({ ok: false, code: "discovery_misconfigured", fields: ["instance.id"] });
    expect(JSON.stringify(body)).not.toContain("synthetic.");
  });
  it("returns 500 with field paths only for a service profile on an http origin", async () => {
    vi.stubEnv("FLUXIQ_PROFILE", "service");
    vi.stubEnv("FLUXIQ_PUBLIC_ORIGIN", "http://app.getfluxiq.com");
    const response = GET();
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ ok: false, code: "discovery_misconfigured", fields: ["deployment_settings"] });
  });
  it("names the offending field when the document itself is invalid", () => {
    const built = buildDiscoveryDocument({ FLUXIQ_SIGN_UP_URL: "http://example.com/x" });
    expect(built).toEqual({ ok: false, fields: ["connect.signUpUrl"] });
  });
});
