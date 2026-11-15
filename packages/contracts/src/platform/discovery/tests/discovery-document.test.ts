// The discovery document: the plan's example parses, a local instance's
// shape parses, and unsafe or inconsistent documents are refused.
import { describe, expect, it } from "vitest";
import { fluxiqDiscoveryDocumentSchema, parseFluxIQDiscoveryDocument } from "../index.ts";

const SERVICE = {
  fluxiqDiscoveryVersion: 1,
  instance: { name: "FluxIQ", profile: "service", product: { name: "FluxIQ", logoUrl: "/product/assets/logo.svg" } },
  origin: "https://app.getfluxiq.com",
  gatewayUrl: "wss://app.getfluxiq.com/client",
  connect: { authorizeUrl: "/connect/authorize", tokenUrl: "/api/connect/token", revokeUrl: "/api/connect/revoke", codeEntryUrl: "/connect", signUpUrl: "https://getfluxiq.com/signup/" },
  protocols: { clientGateway: ["0.1", "0.2"] },
  minimumClient: { "browser-extension": "0.2.0" }
};

const LOCAL = {
  ...SERVICE,
  instance: { name: "FluxIQ", profile: "local" },
  origin: "http://127.0.0.1:3000",
  gatewayUrl: "ws://127.0.0.1:4777",
  connect: { authorizeUrl: "/connect/authorize", tokenUrl: "/api/connect/token", revokeUrl: "/api/connect/revoke", codeEntryUrl: "/connect" },
  minimumClient: {}
};

const RUNTIME = {
  schema: 1,
  protocol: "fluxiq.core-runtime-identity.v1",
  version: "0.49.0-experiment.1",
  artifactDigest: "a".repeat(64)
};

describe("discovery document", () => {
  it("accepts the plan's service example and a local instance", () => {
    expect(fluxiqDiscoveryDocumentSchema.parse(SERVICE)).toEqual(SERVICE);
    expect(fluxiqDiscoveryDocumentSchema.parse(LOCAL)).toEqual(LOCAL);
    expect(fluxiqDiscoveryDocumentSchema.parse(SERVICE).connect.flows).toBeUndefined();
    expect(fluxiqDiscoveryDocumentSchema.parse(SERVICE).instance.id).toBeUndefined();
    expect(fluxiqDiscoveryDocumentSchema.parse(LOCAL).connect.flows).toBeUndefined();
  });

  it.each([
    { authorizationCodePkce: true, referenceCode: false },
    { authorizationCodePkce: false, referenceCode: false },
    { authorizationCodePkce: true, referenceCode: true },
    { authorizationCodePkce: false, referenceCode: true }
  ])("retains explicit flow support without changing discovery v1 or endpoint checks: %j", (flows) => {
    const document = { ...SERVICE, connect: { ...SERVICE.connect, flows } };
    const parsed = parseFluxIQDiscoveryDocument(document, SERVICE.origin);
    expect(parsed.success).toBe(true);
    if (!parsed.success) throw new Error("Valid explicit connect capabilities were refused.");
    expect(parsed.data.connect.flows).toEqual(flows);
    expect(parsed.data.connect.flows?.gatewayReferencePairing).toBeUndefined();
    expect(parsed.data.fluxiqDiscoveryVersion).toBe(1);
    expect(parsed.data.protocols).toEqual(SERVICE.protocols);
    expect(parseFluxIQDiscoveryDocument(document, "https://evil.example").success).toBe(false);
    expect(fluxiqDiscoveryDocumentSchema.safeParse({ ...document, connect: { ...document.connect, tokenUrl: "https://evil.example/token" } }).success).toBe(false);
  });

  it.each([true, false])("retains explicit gateway reference pairing=%s independently of typed reference-code support", (gatewayReferencePairing) => {
    const flows = { authorizationCodePkce: false, referenceCode: false, gatewayReferencePairing };
    const parsed = parseFluxIQDiscoveryDocument({ ...LOCAL, connect: { ...LOCAL.connect, flows } }, LOCAL.origin);
    expect(parsed.success).toBe(true);
    if (!parsed.success) throw new Error("Valid gateway reference pairing capability was refused.");
    expect(parsed.data.connect.flows).toEqual(flows);
    expect(parsed.data.fluxiqDiscoveryVersion).toBe(1);
    expect(parsed.data.minimumClient).toEqual(LOCAL.minimumClient);
  });

  it.each([null, "true", 0, [], {}])("rejects malformed gateway reference pairing: %j", (gatewayReferencePairing) => {
    const flows = { authorizationCodePkce: true, referenceCode: false, gatewayReferencePairing };
    expect(fluxiqDiscoveryDocumentSchema.safeParse({ ...SERVICE, connect: { ...SERVICE.connect, flows } }).success).toBe(false);
  });

  it.each([
    null,
    [],
    true,
    "authorization_code_pkce",
    {},
    { authorizationCodePkce: true },
    { referenceCode: false },
    { authorizationCodePkce: "true", referenceCode: false },
    { authorizationCodePkce: true, referenceCode: 0 }
  ])("rejects malformed explicit flow support: %j", (flows) => {
    expect(fluxiqDiscoveryDocumentSchema.safeParse({ ...SERVICE, connect: { ...SERVICE.connect, flows } }).success).toBe(false);
  });

  it("drops future flow fields while retaining the known explicit support", () => {
    const document = { ...SERVICE, connect: { ...SERVICE.connect, flows: { authorizationCodePkce: true, referenceCode: false, gatewayReferencePairing: false, futureFlow: true } } };
    expect(fluxiqDiscoveryDocumentSchema.parse(document).connect.flows).toEqual({ authorizationCodePkce: true, referenceCode: false, gatewayReferencePairing: false });
  });

  it("drops fields it does not know, so additions never break a client", () => {
    expect(fluxiqDiscoveryDocumentSchema.parse({ ...SERVICE, later: { feature: true } })).toEqual(SERVICE);
  });

  it("preserves optional build provenance without changing compatibility metadata", () => {
    const document = { ...SERVICE, runtime: RUNTIME };
    expect(fluxiqDiscoveryDocumentSchema.parse(document)).toEqual(document);
    expect(fluxiqDiscoveryDocumentSchema.parse({ ...document, runtime: { ...RUNTIME, future: true } })).toEqual(document);
    expect(fluxiqDiscoveryDocumentSchema.parse(SERVICE).runtime).toBeUndefined();
  });

  it.each([
    { ...RUNTIME, schema: 2 },
    { ...RUNTIME, protocol: "unknown" },
    { ...RUNTIME, version: "" },
    { ...RUNTIME, artifactDigest: "placeholder" },
    { ...RUNTIME, artifactDigest: "A".repeat(64) },
    { fluxiqRuntimeIdentityPlaceholder: 302 }
  ])("refuses malformed runtime provenance %j", (runtime) => {
    expect(fluxiqDiscoveryDocumentSchema.safeParse({ ...SERVICE, runtime }).success).toBe(false);
  });

  it("checks the document names the origin it was fetched from", () => {
    expect(parseFluxIQDiscoveryDocument(SERVICE, "https://app.getfluxiq.com").success).toBe(true);
    expect(parseFluxIQDiscoveryDocument(SERVICE, "https://evil.example").success).toBe(false);
  });

  it.each([
    ["another version", { ...SERVICE, fluxiqDiscoveryVersion: 2 }],
    ["an unknown profile", { ...SERVICE, instance: { name: "FluxIQ", profile: "cloud" } }],
    ["plain ws on service", { ...SERVICE, gatewayUrl: "ws://app.getfluxiq.com/client" }],
    ["plain http off loopback", { ...SERVICE, origin: "http://app.getfluxiq.com" }],
    ["an origin with a path", { ...SERVICE, origin: "https://app.getfluxiq.com/" }],
    ["a loopback origin on service", { ...SERVICE, origin: "http://127.0.0.1:3000" }],
    ["an off-origin connect path", { ...SERVICE, connect: { ...SERVICE.connect, tokenUrl: "https://evil.example/token" } }],
    ["a protocol-relative path", { ...SERVICE, connect: { ...SERVICE.connect, authorizeUrl: "//evil.example/authorize" } }],
    ["an http sign-up URL", { ...SERVICE, connect: { ...SERVICE.connect, signUpUrl: "http://getfluxiq.com/signup/" } }],
    ["no protocol", { ...SERVICE, protocols: { clientGateway: [] } }],
    ["a bad client version", { ...SERVICE, minimumClient: { "browser-extension": "latest" } }],
    ["an off-origin logo", { ...SERVICE, instance: { ...SERVICE.instance, product: { name: "FluxIQ", logoUrl: "https://cdn.example/logo.svg" } } }]
  ])("refuses %s", (_label, document) => {
    expect(fluxiqDiscoveryDocumentSchema.safeParse(document).success).toBe(false);
  });
});
