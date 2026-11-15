// @fluxiq-test-group real-sql
import { access, readFile } from "node:fs/promises";
import { afterEach, describe, expect, it } from "vitest";
import { connectTokenResponseSchema } from "@fluxiq/contracts/platform";
import { ConnectCredentialDeliveryError } from "../../index.ts";
import { connectFixture } from "../../tests/connect-fixture.ts";

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

describe("authenticated S256 connect authorization", () => {
  it("redeems the RFC 7636 verifier vector, derives authority server-side and conforms to the response schema", async () => {
    const f = await connectFixture(cleanups);
    const result = await f.service.authorize({ ...f.authorizeRequest, userId: "forged-user", workspaceId: "forged-workspace", approvingSessionDigest: "forged-session" }, f.sessionDigest);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected synthetic consent.");
    expect(result.authorization).toMatchObject({ state: f.authorizeRequest.state, redirectUri: f.authorizeRequest.redirect_uri, expiresAt: f.clock.now + 120_000 });
    expect(result.authorization.code).toMatch(/^[A-Za-z0-9_-]{43}$/u);
    const exchanged = await f.service.exchange({ ...f.tokenRequest(result.authorization.code), userId: "forged-user", workspaceId: "forged-workspace" });
    expect(exchanged.ok).toBe(true);
    if (!exchanged.ok) throw new Error("Expected synthetic exchange.");
    expect(connectTokenResponseSchema.safeParse(exchanged.response).success).toBe(true);
    expect(exchanged.response).toMatchObject({ user: { userId: "user.synthetic" }, workspace: { workspaceId: "workspace.synthetic" }, gatewayUrl: "wss://app.example.com/gateway" });
    expect(f.validateApprovalSession.mock.calls).toEqual([[f.sessionDigest], [f.sessionDigest]]);
    expect(f.issueCredential).toHaveBeenCalledTimes(1);
    expect(f.issueCredential).toHaveBeenCalledWith({ userId: "user.synthetic", workspaceId: "workspace.synthetic", approvingSessionDigest: f.sessionDigest, clientId: f.authorizeRequest.client_id, clientInstallId: f.authorizeRequest.client_install_id, clientLabel: f.authorizeRequest.client_label });
    const bytes = await readFile(f.filePath);
    for (const secret of [result.authorization.code, f.verifier, f.rawCookie, exchanged.response.credential]) expect(bytes.includes(Buffer.from(secret))).toBe(false);
  });

  it("creates independent cryptographic codes for repeated identical consent", async () => {
    const f = await connectFixture(cleanups);
    const codes = await Promise.all(Array.from({ length: 8 }, () => f.authorize()));
    expect(new Set(codes.map((result) => result.code)).size).toBe(8);
    expect(f.issueCredential).not.toHaveBeenCalled();
  });

  it.each([
    { code_challenge_method: "plain" },
    { code_challenge: "short" },
    { code_challenge: "a".repeat(42) },
    { code_challenge: "a".repeat(44) },
    { code_challenge: `${"a".repeat(42)}=` },
    { code_challenge: "é".repeat(43) },
    { redirect_uri: "https://attacker.example.com/connect/done" },
    { redirect_uri: "https://app.example.com/connect/done?next=evil" },
    { redirect_uri: "https://app.example.com/connect/done#credential" },
    { redirect_uri: "https://app.example.com:443/connect/done" },
    { redirect_uri: "https://user@app.example.com/connect/done" },
    { client_id: "attacker-client" },
    { client_label: "bad\nlabel" }
  ])("rejects invalid or foreign consent before authority or storage: %j", async (change) => {
    const f = await connectFixture(cleanups);
    expect(await f.service.authorize({ ...f.authorizeRequest, ...change }, f.sessionDigest)).toEqual({ ok: false, error: { error: "invalid_request" } });
    expect(f.validateApprovalSession).not.toHaveBeenCalled();
    await expect(access(f.filePath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("requires a validated approving session and denies a raw cookie without persistence", async () => {
    const f = await connectFixture(cleanups);
    expect(await f.service.authorize(f.authorizeRequest, f.rawCookie)).toEqual({ ok: false, error: { error: "invalid_grant" } });
    expect(f.validateApprovalSession).not.toHaveBeenCalled();
    expect(await f.service.authorize(f.authorizeRequest, "0".repeat(64))).toEqual({ ok: false, error: { error: "invalid_grant" } });
    f.authority.eligibility = { allowed: false, error: "email_unverified" };
    expect(await f.service.authorize(f.authorizeRequest, f.sessionDigest)).toEqual({ ok: false, error: { error: "email_unverified" } });
    await expect(access(f.filePath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("refuses insecure or non-origin configuration and an invalid gateway before consent", async () => {
    const f = await connectFixture(cleanups);
    for (const instanceOrigin of ["http://app.example.com", "https://app.example.com/", "https://app.example.com/path", "https://user@app.example.com", "not-a-url"]) expect(() => f.createService({ instanceOrigin })).toThrow(TypeError);
    expect(() => f.createService({ gatewayUrl: "ws://app.example.com/gateway" })).toThrow(TypeError);
    expect(() => f.createService({ instanceOrigin: "http://localhost:3000", gatewayUrl: "ws://localhost:3000/gateway" })).not.toThrow();
  });
});

describe("PKCE exchange bindings and eligibility", () => {
  it.each([
    { code_verifier: "x".repeat(43) },
    { client_install_id: "synthetic-install-other" },
    { redirect_uri: "https://other.example.com/connect/done" },
    { code: "x".repeat(43) }
  ])("rejects the wrong proof/binding without burning valid consent: %j", async (change) => {
    const f = await connectFixture(cleanups);
    const authorization = await f.authorize();
    expect(await f.service.exchange({ ...f.tokenRequest(authorization.code), ...change })).toEqual({ ok: false, error: { error: "invalid_grant" } });
    expect(f.issueCredential).not.toHaveBeenCalled();
    expect((await f.service.exchange(f.tokenRequest(authorization.code))).ok).toBe(true);
  });

  it.each([
    [{ code_verifier: "short" }, "invalid_request"],
    [{ code_verifier: "é".repeat(43) }, "invalid_request"],
    [{ code_verifier: "a".repeat(129) }, "invalid_request"],
    [{ code_verifier: undefined }, "invalid_request"],
    [{ client_id: "wrong" }, "invalid_client"],
    [{ client_id: undefined }, "invalid_client"],
    [{ grant_type: "refresh_token" }, "unsupported_grant_type"],
    [{ code: "ill-formed" }, "invalid_request"]
  ])("returns a fixed schema error for malformed exchange: %j", async (change, error) => {
    const f = await connectFixture(cleanups);
    const authorization = await f.authorize();
    expect(await f.service.exchange({ ...f.tokenRequest(authorization.code), ...change })).toEqual({ ok: false, error: { error } });
    expect(f.issueCredential).not.toHaveBeenCalled();
  });

  it("expires exactly at its deadline, and rechecks expiry after asynchronous authority lookup", async () => {
    const f = await connectFixture(cleanups);
    const authorization = await f.authorize();
    f.clock.now = authorization.expiresAt;
    expect(await f.service.exchange(f.tokenRequest(authorization.code))).toEqual({ ok: false, error: { error: "invalid_grant" } });
    const next = await f.authorize();
    f.validateApprovalSession.mockImplementationOnce(async () => {
      f.clock.now = next.expiresAt;
      return f.authority.eligibility;
    });
    expect(await f.service.exchange(f.tokenRequest(next.code))).toEqual({ ok: false, error: { error: "invalid_grant" } });
    expect(f.issueCredential).not.toHaveBeenCalled();
  });

  it.each(["invalid_grant", "account_disabled", "email_unverified", "client_limit_reached"] as const)("rechecks and spends consent when current eligibility changed to %s", async (error) => {
    const f = await connectFixture(cleanups);
    const authorization = await f.authorize();
    const eligible = f.authority.eligibility;
    f.authority.eligibility = { allowed: false, error };
    expect(await f.service.exchange(f.tokenRequest(authorization.code))).toEqual({ ok: false, error: { error } });
    f.authority.eligibility = eligible;
    expect(await f.service.exchange(f.tokenRequest(authorization.code))).toEqual({ ok: false, error: { error: "invalid_grant" } });
    expect(f.issueCredential).not.toHaveBeenCalled();
  });

  it.each(["user", "workspace"] as const)("refuses a current approving session rebound to another %s", async (binding) => {
    const f = await connectFixture(cleanups);
    const authorization = await f.authorize();
    const current = f.authority.eligibility;
    if (!current.allowed) throw new Error("Expected synthetic eligibility.");
    f.authority.eligibility = binding === "user" ? { ...current, user: { ...current.user, userId: "other.user" } } : { ...current, workspace: { ...current.workspace, workspaceId: "other.workspace" } };
    expect(await f.service.exchange(f.tokenRequest(authorization.code))).toEqual({ ok: false, error: { error: "invalid_grant" } });
    expect(f.issueCredential).not.toHaveBeenCalled();
  });

  it("takes current display summaries from revalidation instead of stale consent data", async () => {
    const f = await connectFixture(cleanups);
    const authorization = await f.authorize();
    const current = f.authority.eligibility;
    if (!current.allowed) throw new Error("Expected synthetic eligibility.");
    f.authority.eligibility = { ...current, user: { ...current.user, displayName: "Updated name" }, workspace: { ...current.workspace, name: "Updated workspace" } };
    const exchanged = await f.service.exchange(f.tokenRequest(authorization.code));
    expect(exchanged).toMatchObject({ ok: true, response: { user: { displayName: "Updated name" }, workspace: { name: "Updated workspace" } } });
  });
});

describe("one-use credential delivery", () => {
  it("survives reopen and refuses a lost successful reply without issuing another credential", async () => {
    const f = await connectFixture(cleanups);
    const authorization = await f.authorize();
    await f.repository.close();
    const reopened = f.createService({ repository: f.openRepository() });
    expect((await reopened.exchange(f.tokenRequest(authorization.code))).ok).toBe(true);
    const restarted = f.createService({ repository: f.openRepository() });
    expect(await restarted.exchange(f.tokenRequest(authorization.code))).toEqual({ ok: false, error: { error: "invalid_grant" } });
    expect(f.issueCredential).toHaveBeenCalledTimes(1);
  });

  it("claims before the issuer, so concurrent exchanges while issuance waits mint only once", async () => {
    const f = await connectFixture(cleanups);
    const authorization = await f.authorize();
    let release: (() => void) | undefined;
    let started: (() => void) | undefined;
    const waiting = new Promise<void>((resolve) => { release = resolve; });
    const issuing = new Promise<void>((resolve) => { started = resolve; });
    f.issueCredential.mockImplementationOnce(async () => {
      started!();
      await waiting;
      return { credential: "synthetic-concurrent-credential-0123456789", credentialExpiresAt: f.clock.now + 60_000, connectedClientId: "browser.concurrent" };
    });
    const first = f.service.exchange(f.tokenRequest(authorization.code));
    await issuing;
    const competitors = await Promise.all(Array.from({ length: 7 }, () => f.createService({ repository: f.openRepository() }).exchange(f.tokenRequest(authorization.code))));
    expect(competitors).toEqual(Array.from({ length: 7 }, () => ({ ok: false, error: { error: "invalid_grant" } })));
    release!();
    expect((await first).ok).toBe(true);
    expect(f.issueCredential).toHaveBeenCalledTimes(1);
  });

  it("spends the grant on ambiguous issuer failure, sanitizes its exception and requires fresh consent", async () => {
    const f = await connectFixture(cleanups);
    const authorization = await f.authorize();
    f.issueCredential.mockRejectedValueOnce(new Error("synthetic-private-credential-or-cookie"));
    const failure = await f.service.exchange(f.tokenRequest(authorization.code)).catch((error: unknown) => error);
    expect(failure).toMatchObject({ name: "ConnectCredentialDeliveryError", code: "connect.credential_delivery_unknown" });
    expect(failure).not.toHaveProperty("cause");
    expect(String(failure)).not.toContain("synthetic-private-credential-or-cookie");
    expect(await f.createService({ repository: f.openRepository() }).exchange(f.tokenRequest(authorization.code))).toEqual({ ok: false, error: { error: "invalid_grant" } });
    expect(f.issueCredential).toHaveBeenCalledTimes(1);
    const fresh = await f.authorize();
    expect((await f.service.exchange(f.tokenRequest(fresh.code))).ok).toBe(true);
    expect(f.issueCredential).toHaveBeenCalledTimes(2);
  });

  it.each([
    { credential: "short", credentialExpiresAt: 2_000_000, connectedClientId: "browser.invalid" },
    { credential: "synthetic-credential-012345678901234567890", credentialExpiresAt: 1_000_000, connectedClientId: "browser.invalid" },
    { credential: "synthetic-credential-012345678901234567890", credentialExpiresAt: 2_000_000, connectedClientId: "" }
  ])("refuses malformed issuer output without reopening spent consent", async (issued) => {
    const f = await connectFixture(cleanups);
    const authorization = await f.authorize();
    f.issueCredential.mockResolvedValueOnce(issued);
    await expect(f.service.exchange(f.tokenRequest(authorization.code))).rejects.toBeInstanceOf(ConnectCredentialDeliveryError);
    expect(await f.service.exchange(f.tokenRequest(authorization.code))).toEqual({ ok: false, error: { error: "invalid_grant" } });
  });
});
