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

describe("discovery document", () => {
  it("accepts the plan's service example and a local instance", () => {
    expect(fluxiqDiscoveryDocumentSchema.parse(SERVICE)).toEqual(SERVICE);
    expect(fluxiqDiscoveryDocumentSchema.parse(LOCAL)).toEqual(LOCAL);
  });

  it("drops fields it does not know, so additions never break a client", () => {
    expect(fluxiqDiscoveryDocumentSchema.parse({ ...SERVICE, later: { feature: true } })).toEqual(SERVICE);
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
