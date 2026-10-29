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
    expect(document.instance).toEqual({ name: "FluxIQ", profile: "local" });
    expect(document.minimumClient).toEqual({ "browser-extension": "0.1.0" });
    expect(document.connect.signUpUrl).toBeUndefined();
  });
  it("serves the service profile with its name and sign-up URL", async () => {
    vi.stubEnv("FLUXIQ_PROFILE", "service");
    vi.stubEnv("FLUXIQ_PUBLIC_ORIGIN", "https://app.getfluxiq.com");
    vi.stubEnv("FLUXIQ_INSTANCE_NAME", "FluxIQ Cloud");
    vi.stubEnv("FLUXIQ_SIGN_UP_URL", "https://getfluxiq.com/sign-up");
    const document = await GET().json();
    expect(parseFluxIQDiscoveryDocument(document, "https://app.getfluxiq.com").success).toBe(true);
    expect(document.instance.name).toBe("FluxIQ Cloud");
    expect(document.gatewayUrl.startsWith("wss:")).toBe(true);
    expect(document.connect.signUpUrl).toBe("https://getfluxiq.com/sign-up");
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
