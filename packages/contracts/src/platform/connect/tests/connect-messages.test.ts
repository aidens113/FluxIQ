// The connect flow's messages: authorize query, token request and response,
// token errors, revoke, the done fragment, the PKCE shapes and continue paths.
import { describe, expect, it } from "vitest";
import {
  connectAuthorizeRequestSchema,
  connectRedirectUri,
  connectRevokeRequestSchema,
  connectTokenErrorSchema,
  connectTokenRequestSchema,
  connectTokenResponseSchema,
  isConnectContinuePath,
  isPkceCodeVerifier,
  isPkceS256Challenge,
  parseConnectDoneFragment
} from "../index.ts";

// RFC 7636 Appendix B.
const VERIFIER = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
const CHALLENGE = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";
const ORIGIN = "https://app.getfluxiq.com";
const CODE = "Qk3f9xZ0aB1cD2eF3gH4iJ5kL6mN7oP8qR9sT0uV1wX";
const STATE = "st4te-0123456789abcdef";

const AUTHORIZE = {
  client_id: "fluxiq-browser-extension",
  redirect_uri: connectRedirectUri(ORIGIN),
  code_challenge: CHALLENGE,
  code_challenge_method: "S256",
  state: STATE,
  client_install_id: "6b0f2c8e-1d4a-4c6b-9f3e-2a7d5b8c0e1f",
  client_label: "Work laptop"
};

const TOKEN = {
  grant_type: "authorization_code",
  code: CODE,
  code_verifier: VERIFIER,
  redirect_uri: connectRedirectUri(ORIGIN),
  client_id: "fluxiq-browser-extension",
  client_install_id: AUTHORIZE.client_install_id
};

describe("connect: PKCE and paths", () => {
  it("knows the RFC 7636 verifier and challenge shapes", () => {
    expect(isPkceCodeVerifier(VERIFIER)).toBe(true);
    expect(isPkceS256Challenge(CHALLENGE)).toBe(true);
    expect(isPkceCodeVerifier("short")).toBe(false);
    expect(isPkceCodeVerifier(`${VERIFIER}=`)).toBe(false);
    expect(isPkceS256Challenge(`${CHALLENGE}=`)).toBe(false);
  });

  it("honours a continue URL only to the authorize page", () => {
    expect(isConnectContinuePath("/connect/authorize")).toBe(true);
    expect(isConnectContinuePath("/connect/authorize?client_id=fluxiq-browser-extension&state=x")).toBe(true);
    for (const path of ["/connect/authorized", "/connect", "//evil.example/connect/authorize", "https://app.getfluxiq.com/connect/authorize", "/connect/authorize#x", "/connect/authorize/../x"]) {
      expect(isConnectContinuePath(path)).toBe(false);
    }
  });
});

describe("connect: authorize and token", () => {
  it("accepts a full authorize query and ignores unknown parameters", () => {
    expect(connectAuthorizeRequestSchema.parse({ ...AUTHORIZE, utm_source: "x" })).toEqual(AUTHORIZE);
  });

  it.each([
    ["another client", { client_id: "other" }],
    ["plain challenge method", { code_challenge_method: "plain" }],
    ["another redirect path", { redirect_uri: `${ORIGIN}/connect/elsewhere` }],
    ["a redirect with a query", { redirect_uri: `${ORIGIN}/connect/done?x=1` }],
    ["an http redirect off loopback", { redirect_uri: "http://app.getfluxiq.com/connect/done" }],
    ["a short state", { state: "abc" }],
    ["a padded challenge", { code_challenge: `${CHALLENGE.slice(0, 42)}=` }],
    ["a control character in the label", { client_label: "Work\nlaptop" }]
  ])("refuses an authorize query with %s", (_label, change) => {
    expect(connectAuthorizeRequestSchema.safeParse({ ...AUTHORIZE, ...change }).success).toBe(false);
  });

  it("accepts a token request and refuses a bad grant or verifier", () => {
    expect(connectTokenRequestSchema.parse(TOKEN)).toEqual(TOKEN);
    expect(connectTokenRequestSchema.safeParse({ ...TOKEN, grant_type: "refresh_token" }).success).toBe(false);
    expect(connectTokenRequestSchema.safeParse({ ...TOKEN, code_verifier: "x" }).success).toBe(false);
    expect(connectTokenRequestSchema.safeParse({ ...TOKEN, code: "too-short" }).success).toBe(false);
  });

  it("accepts the token response and refuses an insecure gateway or short credential", () => {
    const response = {
      credential: "c".repeat(43),
      credentialExpiresAt: 1_800_000_000_000,
      connectedClientId: "cc-1",
      user: { userId: "u1", displayName: "Ada", email: "ada@example.com" },
      workspace: { workspaceId: "ws-1", name: "Ada's workspace" },
      gatewayUrl: "wss://app.getfluxiq.com/client"
    };
    expect(connectTokenResponseSchema.parse(response)).toEqual(response);
    expect(connectTokenResponseSchema.safeParse({ ...response, gatewayUrl: "ws://app.getfluxiq.com/client" }).success).toBe(false);
    expect(connectTokenResponseSchema.safeParse({ ...response, credential: "short" }).success).toBe(false);
    expect(connectTokenResponseSchema.safeParse({ ...response, user: { userId: "u1" } }).success).toBe(false);
  });

  it("types token errors and revoke bodies", () => {
    expect(connectTokenErrorSchema.parse({ error: "invalid_grant" })).toEqual({ error: "invalid_grant" });
    expect(connectTokenErrorSchema.safeParse({ error: "nope" }).success).toBe(false);
    expect(connectRevokeRequestSchema.parse({ token: "abc" })).toEqual({ token: "abc" });
    expect(connectRevokeRequestSchema.safeParse({}).success).toBe(false);
  });
});

describe("connect: the done fragment", () => {
  it("reads a code or an error with its state", () => {
    expect(parseConnectDoneFragment(`#code=${CODE}&state=${STATE}`)).toEqual({ kind: "code", code: CODE, state: STATE });
    expect(parseConnectDoneFragment(`state=${STATE}&code=${CODE}`)).toEqual({ kind: "code", code: CODE, state: STATE });
    expect(parseConnectDoneFragment(`#error=access_denied&state=${STATE}`)).toEqual({ kind: "error", error: "access_denied", state: STATE });
  });

  it.each([
    "",
    `#code=${CODE}`,
    `#state=${STATE}`,
    `#code=${CODE}&state=${STATE}&error=access_denied`,
    `#code=${CODE}&code=${CODE}&state=${STATE}`,
    `#code=${CODE}&state=${STATE}&extra=1`,
    `#code=bad&state=${STATE}`,
    `#error=unknown&state=${STATE}`,
    `#code=${CODE}&state=bad`
  ])("refuses %j", (fragment) => {
    expect(parseConnectDoneFragment(fragment)).toBeNull();
  });
});
