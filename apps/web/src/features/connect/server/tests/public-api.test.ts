import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getConnectService, revokeConnectCredential } from "../../../../server/connect";
import { POST as exchangeConnectToken } from "../../../../app/api/connect/token";
import { POST as revokeConnectToken } from "../../../../app/api/connect/revoke";
import { ORIGIN, TOKEN_REQUEST, TOKEN_RESPONSE, publicRequest } from "./fixture";

vi.mock("../../../../server/connect", () => ({ getConnectService: vi.fn(), revokeConnectCredential: vi.fn(), validateConnectApproval: vi.fn(), authorizeConnectConsent: vi.fn() }));
const exchange = vi.fn();
const authorize = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("FLUXIQ_PROFILE", "service");
  vi.stubEnv("FLUXIQ_PUBLIC_ORIGIN", ORIGIN);
  vi.mocked(getConnectService).mockResolvedValue({ authorize, exchange });
  exchange.mockResolvedValue({ ok: true, response: TOKEN_RESPONSE });
  vi.mocked(revokeConnectCredential).mockResolvedValue(undefined);
});
afterEach(() => vi.unstubAllEnvs());

describe("public PKCE token and revoke HTTP boundaries", () => {
  it("returns the service's schema-valid one-time credential without relying on a cookie", async () => {
    const response = await exchangeConnectToken(publicRequest(TOKEN_REQUEST, { cookie: "__Host-fluxiq_session=synthetic-unused-cookie" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(TOKEN_RESPONSE);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(exchange).toHaveBeenCalledWith(TOKEN_REQUEST);
    expect(authorize).not.toHaveBeenCalled();
  });

  it("admits missing Origin and exact origin, plus only configured extension origins", async () => {
    const extension = `chrome-extension://${"a".repeat(32)}`;
    vi.stubEnv("FLUXIQ_CLIENT_GATEWAY_ALLOWED_ORIGINS", `${extension},moz-extension://*`);
    for (const origin of [ORIGIN, extension, "moz-extension://01234567-0123-4567-89ab-0123456789ab"]) expect((await exchangeConnectToken(publicRequest(undefined, { origin }))).status).toBe(200);
    for (const origin of ["https://evil.example", `chrome-extension://${"b".repeat(32)}`, "null"]) expect((await exchangeConnectToken(publicRequest({}, { origin }))).status).toBe(403);
  });

  it("rejects absent client admission, wrong media type and malformed JSON before opening the service", async () => {
    expect((await exchangeConnectToken(publicRequest({}, { "fluxiq-client": "" }))).status).toBe(400);
    expect((await exchangeConnectToken(publicRequest({}, { "content-type": "text/plain" }))).status).toBe(415);
    const request = new Request(`${ORIGIN}/api/connect/token`, { method: "POST", headers: { "content-type": "application/json", "fluxiq-client": "browser-extension" }, body: "{" });
    expect((await exchangeConnectToken(request)).status).toBe(400);
    expect(getConnectService).not.toHaveBeenCalled();
  });

  it("bounds declared and undeclared streaming bytes even when content length lies", async () => {
    expect((await exchangeConnectToken(publicRequest({}, { "content-length": "99999" }))).status).toBe(413);
    expect((await exchangeConnectToken(publicRequest({ large: "x".repeat(9000) }))).status).toBe(413);
    expect((await exchangeConnectToken(publicRequest({ large: "x".repeat(9000) }, { "content-length": "1" }))).status).toBe(413);
    expect(getConnectService).not.toHaveBeenCalled();
  });

  it.each([{ code_verifier: "short" }, { code_verifier: "a".repeat(129) }, { code: "malformed" }, { redirect_uri: "https://evil.example/other" }])("rejects malformed PKCE fields before opening authority: %j", async (change) => {
    const response = await exchangeConnectToken(publicRequest({ ...TOKEN_REQUEST, ...change }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_request" });
    expect(getConnectService).not.toHaveBeenCalled();
  });

  it.each([["invalid_client", 401], ["invalid_grant", 400], ["invalid_request", 400], ["unsupported_grant_type", 400], ["rate_limited", 429], ["temporarily_unavailable", 503]])("keeps %s status and drops all free-form error details", async (error, status) => {
    exchange.mockResolvedValueOnce({ ok: false, error: { error, error_description: "synthetic-private-database-detail" } });
    const response = await exchangeConnectToken(publicRequest());
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ error });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("redacts operational failures and invalid service output instead of returning false proof failures", async () => {
    exchange.mockRejectedValueOnce(new Error("synthetic-credential-and-private-storage"));
    let response = await exchangeConnectToken(publicRequest());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "temporarily_unavailable" });
    exchange.mockResolvedValueOnce({ ok: true, response: { credential: "short" } });
    response = await exchangeConnectToken(publicRequest());
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("short");
  });

  it("revokes through real authority and gives an indistinguishable empty response for accepted tokens", async () => {
    for (const token of ["synthetic-valid-credential", "synthetic-invalid-credential"]) {
      const response = await revokeConnectToken(publicRequest({ token }));
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({});
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(revokeConnectCredential).toHaveBeenCalledWith(token);
    }
    expect((await revokeConnectToken(publicRequest({}))).status).toBe(400);
    expect(revokeConnectCredential).toHaveBeenCalledTimes(2);
  });

  it("does not pretend revocation succeeded when authority persistence failed", async () => {
    vi.mocked(revokeConnectCredential).mockRejectedValueOnce(new Error("synthetic-token-and-private-revoke-data"));
    const response = await revokeConnectToken(publicRequest({ token: "synthetic-credential" }));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "temporarily_unavailable" });
  });

  it("does not advertise public hosted token exchange as available locally", async () => {
    vi.stubEnv("FLUXIQ_PROFILE", "local");
    expect((await exchangeConnectToken(publicRequest())).status).toBe(404);
    expect(getConnectService).not.toHaveBeenCalled();
  });
});
