// The client gateway's Origin grammar: allowlist entries, prefix matching for
// `moz-extension://*`, the missing-Origin rule by profile and bind, and the
// refusal to start a public gateway without an allowlist.
import { describe, expect, it } from "vitest";
import type { FluxIQProfile } from "../../profile.ts";
import { admitClientGatewayOrigin, clientGatewayOriginStartRefusal, parseClientGatewayOriginAllowlist, parseClientGatewayOriginRule, type ClientGatewayOriginRule } from "../index.ts";

const CHROME = "chrome-extension://abcdefghijklmnopabcdefghijklmnop";
const EDGE = "chrome-extension://ponmlkjihgfedcbaponmlkjihgfedcba";
const FIREFOX = "moz-extension://0f1e2d3c-4b5a-6978-8a9b-acbdcedfe0f1";

describe("Origin allowlist entries", () => {
  it.each([CHROME, EDGE, FIREFOX, "https://app.getfluxiq.com", "http://127.0.0.1:3000", "http://192.168.1.20:3000", "https://app.example.com:8443"])("accepts %s exactly", (entry) => {
    expect(parseClientGatewayOriginRule(entry)).toEqual({ kind: "exact", origin: entry });
  });

  it("reads moz-extension://* as a prefix", () => {
    expect(parseClientGatewayOriginRule("moz-extension://*")).toEqual({ kind: "prefix", prefix: "moz-extension://" });
  });

  it.each([
    "*",
    "null",
    "",
    "chrome-extension://*",
    "chrome-extension://short",
    "chrome-extension://ABCDEFGHIJKLMNOPABCDEFGHIJKLMNOP",
    "moz-extension://not-a-uuid",
    "https://*.getfluxiq.com",
    "https://app.getfluxiq.com/",
    "https://app.getfluxiq.com/connect",
    "https://APP.getfluxiq.com",
    "https://app.getfluxiq.com:443",
    "https://user@app.getfluxiq.com",
    "wss://app.getfluxiq.com",
    "safari-web-extension://0f1e2d3c-4b5a-6978-8a9b-acbdcedfe0f1"
  ])("refuses %j", (entry) => {
    expect(parseClientGatewayOriginRule(entry)).toBeNull();
  });

  it("splits a list into rules and verbatim refusals", () => {
    expect(parseClientGatewayOriginAllowlist([CHROME, "*", "moz-extension://*"])).toEqual({
      rules: [{ kind: "exact", origin: CHROME }, { kind: "prefix", prefix: "moz-extension://" }],
      refused: ["*"]
    });
  });
});

describe("Origin admission", () => {
  const rules: ClientGatewayOriginRule[] = parseClientGatewayOriginAllowlist([CHROME, EDGE, "moz-extension://*"]).rules;
  const at = (profile: FluxIQProfile, loopbackBind: boolean, list: readonly ClientGatewayOriginRule[] = rules) => ({ profile, loopbackBind, rules: list });

  it("admits listed origins and any Firefox install, and nothing else", () => {
    const context = at("service", true);
    expect(admitClientGatewayOrigin(CHROME, context)).toEqual({ admitted: true });
    expect(admitClientGatewayOrigin(EDGE, context)).toEqual({ admitted: true });
    expect(admitClientGatewayOrigin(FIREFOX, context)).toEqual({ admitted: true });
    expect(admitClientGatewayOrigin("moz-extension://another-install-id", context)).toEqual({ admitted: true });
    for (const origin of ["https://evil.example", "chrome-extension://zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz", "moz-extension://", "moz-extension://x/y", "null", `${CHROME}x`]) {
      expect(admitClientGatewayOrigin(origin, context)).toEqual({ admitted: false, reason: "origin_not_allowed" });
    }
  });

  it("refuses a missing Origin on service and on any public bind", () => {
    for (const context of [at("service", true), at("service", false), at("self-hosted", false), at("local", false)]) {
      expect(admitClientGatewayOrigin(undefined, context)).toEqual({ admitted: false, reason: "missing_origin" });
      expect(admitClientGatewayOrigin("", context)).toEqual({ admitted: false, reason: "missing_origin" });
      expect(admitClientGatewayOrigin(null, context)).toEqual({ admitted: false, reason: "missing_origin" });
    }
  });

  it("accepts a missing Origin on local and loopback self-hosted, with or without an allowlist", () => {
    for (const context of [at("local", true), at("self-hosted", true), at("local", true, []), at("self-hosted", true, [])]) {
      expect(admitClientGatewayOrigin(undefined, context)).toEqual({ admitted: true });
    }
  });

  it("keeps the open loopback gateway open and a public one closed without rules", () => {
    expect(admitClientGatewayOrigin("https://anything.example", at("local", true, []))).toEqual({ admitted: true });
    expect(admitClientGatewayOrigin(CHROME, at("service", true, []))).toEqual({ admitted: false, reason: "origin_not_allowed" });
  });

  it("refuses to start a public gateway without an allowlist", () => {
    expect(clientGatewayOriginStartRefusal(at("service", true, []))).toMatch(/allowlist/u);
    expect(clientGatewayOriginStartRefusal(at("self-hosted", false, []))).toMatch(/allowlist/u);
    expect(clientGatewayOriginStartRefusal(at("service", true))).toBeNull();
    expect(clientGatewayOriginStartRefusal(at("local", true, []))).toBeNull();
    expect(clientGatewayOriginStartRefusal(at("self-hosted", true, []))).toBeNull();
  });
});
