// The product manifest (`PanelProduct`) and the default gateway allowlist it implies.
import { describe, expect, it } from "vitest";
import { defaultClientGatewayOriginAllowlist, panelProductAssetUrl, panelProductSchema, type PanelProduct } from "../index.ts";

const PRODUCT: PanelProduct = {
  id: "acme",
  name: "Acme Automate",
  shortName: "Acme",
  assets: { logo: "logo.svg", favicon: "favicon.ico", signInArt: "sign-in.webp" },
  brand: { light: { primary: "#0b5fff", primaryHover: "#0848cc", focus: "#ff8a00" }, dark: { primary: "#5c95ff", primaryHover: "#86afff", focus: "#ffae4d" } },
  links: { website: "https://acme.example", terms: "https://acme.example/terms", privacy: "https://acme.example/privacy", support: "https://acme.example/help", status: "https://status.acme.example" },
  auth: { signInTitle: "Sign in to Acme", signInMessage: "Use your Acme account.", signUpUrl: "https://acme.example/signup/" },
  extensionStores: [{ id: "chrome-web-store", label: "Chrome Web Store", url: "https://chromewebstore.google.com/detail/acme/abcdefghijklmnopabcdefghijklmnop" }],
  extensionClients: [
    { id: "chromium", label: "Chrome and Edge", origins: ["chrome-extension://abcdefghijklmnopabcdefghijklmnop", "chrome-extension://ponmlkjihgfedcbaponmlkjihgfedcba"] },
    { id: "firefox", label: "Firefox", origins: ["moz-extension://*"] }
  ],
  email: { sender: { name: "Acme", address: "no-reply@acme.example" }, templates: { welcome: { subject: "Welcome to Acme", text: "Hello {{displayName}}: {{welcomeUrl}}" } } }
};

describe("panel product manifest", () => {
  it("accepts a full manifest and a minimal one", () => {
    expect(panelProductSchema.parse(PRODUCT)).toEqual(PRODUCT);
    expect(panelProductSchema.parse({ id: "acme", name: "Acme", shortName: "Acme" })).toEqual({ id: "acme", name: "Acme", shortName: "Acme" });
  });

  it.each([
    ["an unknown key", { ...PRODUCT, theme: {} }],
    ["an upper-case id", { ...PRODUCT, id: "Acme" }],
    ["a path in an asset name", { ...PRODUCT, assets: { logo: "../logo.svg" } }],
    ["a script asset", { ...PRODUCT, assets: { logo: "logo.js" } }],
    ["a named colour", { ...PRODUCT, brand: { light: { primary: "blue", primaryHover: "#0848cc", focus: "#ff8a00" } } }],
    ["a partial accent", { ...PRODUCT, brand: { light: { primary: "#0b5fff" } } }],
    ["an http link", { ...PRODUCT, links: { terms: "http://acme.example/terms" } }],
    ["a wildcard Chrome origin", { ...PRODUCT, extensionClients: [{ id: "chromium", label: "Chrome", origins: ["chrome-extension://*"] }] }],
    ["an unknown email template", { ...PRODUCT, email: { sender: { name: "Acme", address: "a@acme.example" }, templates: { invoice: { subject: "x", text: "y" } } } }]
  ])("refuses %s", (_label, product) => {
    expect(panelProductSchema.safeParse(product).success).toBe(false);
  });

  it("serves assets under /product/assets/", () => {
    expect(panelProductAssetUrl("logo.svg")).toBe("/product/assets/logo.svg");
    expect(() => panelProductAssetUrl("../secret.png")).toThrow(TypeError);
  });

  it("defaults the gateway allowlist to the product's origins plus any Firefox install", () => {
    expect(defaultClientGatewayOriginAllowlist(PRODUCT)).toEqual(["chrome-extension://abcdefghijklmnopabcdefghijklmnop", "chrome-extension://ponmlkjihgfedcbaponmlkjihgfedcba", "moz-extension://*"]);
    expect(defaultClientGatewayOriginAllowlist(null)).toEqual(["moz-extension://*"]);
  });
});
