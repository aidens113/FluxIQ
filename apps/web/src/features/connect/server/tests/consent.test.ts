import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authorizeConnectConsent, getConnectService, validateConnectApproval } from "../../../../server/connect";
import { prepareConnectConsent } from "..";
import { POST as submitConnectConsent } from "../../../../app/api/connect/authorize";
import { createConsentEvidence } from "../consent-evidence";
import { AUTHORIZE_REQUEST, ORIGIN, RAW_COOKIE, SYNTHETIC_CODE, TOKEN_RESPONSE, authorizeParams } from "./fixture";

vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("../../../../server/connect", () => ({ getConnectService: vi.fn(), validateConnectApproval: vi.fn(), authorizeConnectConsent: vi.fn(), revokeConnectCredential: vi.fn() }));
const authorize = vi.fn();
const exchange = vi.fn();
let cookie: string | null;

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("FLUXIQ_PROFILE", "service");
  vi.stubEnv("FLUXIQ_PUBLIC_ORIGIN", ORIGIN);
  cookie = RAW_COOKIE;
  vi.mocked(cookies).mockImplementation(async () => ({ get: (name: string) => name === "__Host-fluxiq_session" && cookie ? { name, value: cookie } : undefined }) as Awaited<ReturnType<typeof cookies>>);
  vi.mocked(getConnectService).mockResolvedValue({ authorize, exchange });
  vi.mocked(validateConnectApproval).mockResolvedValue({ allowed: true, user: TOKEN_RESPONSE.user, workspace: TOKEN_RESPONSE.workspace });
  vi.mocked(authorizeConnectConsent).mockResolvedValue({ allowed: true });
  authorize.mockResolvedValue({ ok: true, authorization: { code: SYNTHETIC_CODE, state: AUTHORIZE_REQUEST.state, redirectUri: AUTHORIZE_REQUEST.redirect_uri, expiresAt: 1_120_000 } });
});
afterEach(() => vi.unstubAllEnvs());

function formRequest(change: Record<string, string> = {}, headers: Record<string, string> = {}): Request {
  const form = authorizeParams();
  form.set("decision", "approve");
  form.set("consent_evidence", createConsentEvidence(AUTHORIZE_REQUEST, RAW_COOKIE));
  for (const [key, value] of Object.entries(change)) form.set(key, value);
  return new Request(`${ORIGIN}/api/connect/authorize`, { method: "POST", headers: { origin: ORIGIN, "content-type": "application/x-www-form-urlencoded", ...headers }, body: form });
}

describe("connect consent GET", () => {
  it("only displays authenticated approval and never calls the authorization service", async () => {
    const view = await prepareConnectConsent(authorizeParams());
    expect(view).toMatchObject({ kind: "consent", user: TOKEN_RESPONSE.user, workspace: TOKEN_RESPONSE.workspace });
    expect(validateConnectApproval).toHaveBeenCalledWith(createHash("sha256").update(RAW_COOKIE).digest("hex"));
    expect(JSON.stringify(view)).not.toContain(RAW_COOKIE);
    expect(getConnectService).not.toHaveBeenCalled();
    expect(authorize).not.toHaveBeenCalled();
  });

  it("asks a signed-out visitor to log in and preserves the authorize path in a safe signup link", async () => {
    cookie = null;
    vi.stubEnv("FLUXIQ_SIGN_UP_URL", "https://getfluxiq.com/signup");
    const view = await prepareConnectConsent(authorizeParams());
    expect(view.kind).toBe("login");
    if (view.kind !== "login") throw new Error("Expected synthetic login view.");
    const target = new URL(view.signUpUrl!);
    expect(target.origin).toBe("https://getfluxiq.com");
    expect(target.searchParams.get("continue")).toBe(`/connect/authorize?${authorizeParams()}`);
    expect(validateConnectApproval).not.toHaveBeenCalled();
  });

  it.each(["local", "self-hosted"])("does not claim hosted connect works in %s", async (profile) => {
    vi.stubEnv("FLUXIQ_PROFILE", profile);
    expect(await prepareConnectConsent(authorizeParams())).toEqual({ kind: "unavailable" });
    expect(validateConnectApproval).not.toHaveBeenCalled();
  });

  it("refuses foreign redirects, repeated required fields and malformed PKCE before reading authority", async () => {
    for (const [key, value] of [["redirect_uri", "https://evil.example/connect/done"], ["code_challenge_method", "plain"], ["code_challenge", "too-short"]]) {
      const query = authorizeParams();
      query.set(key!, value!);
      expect(await prepareConnectConsent(query)).toEqual({ kind: "invalid" });
    }
    const duplicate = authorizeParams();
    duplicate.append("state", AUTHORIZE_REQUEST.state);
    expect(await prepareConnectConsent(duplicate)).toEqual({ kind: "invalid" });
    expect(validateConnectApproval).not.toHaveBeenCalled();
  });

  it("shows an honest refusal when approval is revoked or authority is unavailable, with no exception details", async () => {
    vi.mocked(validateConnectApproval).mockResolvedValueOnce({ allowed: false, error: "email_unverified" });
    expect(await prepareConnectConsent(authorizeParams())).toMatchObject({ kind: "refused", message: "Verify your email before connecting this browser." });
    vi.mocked(validateConnectApproval).mockRejectedValueOnce(new Error("synthetic-private-cookie-or-database"));
    const view = await prepareConnectConsent(authorizeParams());
    expect(view.kind).toBe("refused");
    expect(JSON.stringify(view)).not.toContain("synthetic-private-cookie-or-database");
  });
});

describe("authenticated consent POST", () => {
  it("requires real cookie/IAM authority and returns its code only in the exact done fragment", async () => {
    const response = await submitConnectConsent(formRequest({ userId: "forged-user", workspaceId: "forged-workspace" }));
    expect(response.status).toBe(303);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    const location = new URL(response.headers.get("location")!);
    expect(location.origin).toBe(ORIGIN);
    expect(location.pathname).toBe("/connect/done");
    expect(location.search).toBe("");
    expect(new URLSearchParams(location.hash.slice(1)).get("code")).toBe(SYNTHETIC_CODE);
    expect(await response.text()).toBe("");
    expect(authorizeConnectConsent).toHaveBeenCalledWith(RAW_COOKIE);
    expect(authorize).toHaveBeenCalledWith(AUTHORIZE_REQUEST, createHash("sha256").update(RAW_COOKIE).digest("hex"));
  });

  it.each([{ origin: "https://evil.example" }, { origin: "null" }, { origin: "" }, { "sec-fetch-site": "same-site" }])("refuses non-exact browser Origin before cookie authority: %j", async (headers) => {
    expect((await submitConnectConsent(formRequest({}, headers))).status).toBe(403);
    expect(authorizeConnectConsent).not.toHaveBeenCalled();
    expect(getConnectService).not.toHaveBeenCalled();
  });

  it("refuses a missing cookie, denied IAM and evidence from another session", async () => {
    cookie = null;
    expect((await submitConnectConsent(formRequest())).status).toBe(401);
    cookie = "synthetic-other-session";
    expect((await submitConnectConsent(formRequest())).status).toBe(403);
    cookie = RAW_COOKIE;
    vi.mocked(authorizeConnectConsent).mockResolvedValueOnce({ allowed: false, status: 403 });
    expect((await submitConnectConsent(formRequest())).status).toBe(403);
    expect(authorize).not.toHaveBeenCalled();
  });

  it.each(["client_install_id", "client_label", "code_challenge", "state"])("binds the displayed %s to the approved form", async (field) => {
    const values: Record<string, string> = { client_install_id: "different-install", client_label: "Different browser", code_challenge: "a".repeat(43), state: "different-state-0123456789" };
    expect((await submitConnectConsent(formRequest({ [field]: values[field]! }))).status).toBe(403);
    expect(authorizeConnectConsent).not.toHaveBeenCalled();
  });

  it("declines without issuing, returns only a validated error fragment and no fake completion", async () => {
    const response = await submitConnectConsent(formRequest({ decision: "deny" }));
    expect(response.status).toBe(303);
    const target = new URL(response.headers.get("location")!);
    expect(target.search).toBe("");
    expect(target.hash).toBe(`#error=access_denied&state=${AUTHORIZE_REQUEST.state}`);
    expect(getConnectService).not.toHaveBeenCalled();
  });

  it("rejects foreign redirects, duplicate values, malformed forms and oversized streaming bodies", async () => {
    expect((await submitConnectConsent(formRequest({ redirect_uri: "https://evil.example/connect/done" }))).status).toBe(400);
    expect((await submitConnectConsent(formRequest({}, { "content-type": "application/json" }))).status).toBe(415);
    const duplicate = authorizeParams();
    duplicate.append("client_id", AUTHORIZE_REQUEST.client_id);
    expect((await submitConnectConsent(new Request(`${ORIGIN}/api/connect/authorize`, { method: "POST", headers: { origin: ORIGIN, "content-type": "application/x-www-form-urlencoded" }, body: duplicate }))).status).toBe(400);
    expect((await submitConnectConsent(formRequest({ padding: "x".repeat(9000) }))).status).toBe(413);
    expect(getConnectService).not.toHaveBeenCalled();
  });

  it("sanitizes unexpected failures and refuses a service result with a changed redirect or state", async () => {
    authorize.mockRejectedValueOnce(new Error("synthetic-secret-code-database"));
    let response = await submitConnectConsent(formRequest());
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("synthetic-secret-code-database");
    authorize.mockResolvedValueOnce({ ok: true, authorization: { code: SYNTHETIC_CODE, state: AUTHORIZE_REQUEST.state, redirectUri: "https://evil.example/connect/done", expiresAt: 1_120_000 } });
    response = await submitConnectConsent(formRequest());
    expect(response.status).toBe(503);
    expect(response.headers.get("location")).toBeNull();
  });
});
