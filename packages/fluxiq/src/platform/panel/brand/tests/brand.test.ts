import type { PanelProduct } from "@fluxiq/contracts/platform";
import { describe, expect, it } from "vitest";
import { checkPanelBrandContrast, contrastRatio, panelBrandStyle, panelBranding } from "../index.ts";

const GOOD = { primary: "#0b5cad", primaryHover: "#084a8a", focus: "#0b5cad" };
const PRODUCT: PanelProduct = {
  id: "demo",
  name: "Demo Product",
  shortName: "Demo",
  assets: { logo: "logo.svg", signInArt: "art.png" },
  brand: { light: GOOD },
  links: { website: "https://example.com" },
  auth: { signInTitle: "Sign in", signUpUrl: "https://example.com/join" }
};

describe("contrastRatio", () => {
  it("matches known WCAG vectors", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#ffffff", "#ffffff")).toBeCloseTo(1, 5);
    expect(contrastRatio("#777777", "#ffffff")).toBeCloseTo(4.48, 2);
  });
  it("rejects a malformed colour", () => {
    expect(() => contrastRatio("red", "#ffffff")).toThrow(TypeError);
  });
});

describe("checkPanelBrandContrast", () => {
  it("accepts good accents and a product without a brand", () => {
    expect(checkPanelBrandContrast(PRODUCT)).toEqual({ ok: true, failures: [] });
    expect(checkPanelBrandContrast({ ...PRODUCT, brand: undefined }).ok).toBe(true);
  });
  it("names every failing accent", () => {
    const result = checkPanelBrandContrast({ ...PRODUCT, brand: { light: { primary: "#777777", primaryHover: "#084a8a", focus: "#f2f3f3" } } });
    expect(result.ok).toBe(false);
    expect(result.failures.some((line) => line.includes("light.primary "))).toBe(true);
    expect(result.failures.some((line) => line.includes("light.focus"))).toBe(true);
    expect(result.failures.some((line) => line.includes("light.primaryHover"))).toBe(false);
  });
  it("validates dark accents against the dark surfaces", () => {
    expect(checkPanelBrandContrast({ ...PRODUCT, brand: { dark: GOOD } }).ok).toBe(false);
  });
});

describe("panelBrandStyle", () => {
  it("maps the light accents to the panel tokens and ignores dark", () => {
    expect(panelBrandStyle(PRODUCT)).toEqual({ "--color-primary": GOOD.primary, "--color-primary-hover": GOOD.primaryHover, "--color-focus": GOOD.focus });
    expect(panelBrandStyle({ ...PRODUCT, brand: { dark: GOOD } })).toEqual({});
    expect(panelBrandStyle(null)).toEqual({});
  });
});

describe("panelBranding", () => {
  it("returns stock values with no product", () => {
    expect(panelBranding(null)).toEqual({ name: "FluxIQ", shortName: "FluxIQ", logoUrl: null, faviconUrl: null, signInArtUrl: null, style: {}, links: {}, signInTitle: null, signInMessage: null, signUpUrl: null });
  });
  it("returns the product's identity, asset urls and auth words", () => {
    const branding = panelBranding(PRODUCT);
    expect(branding).toMatchObject({ name: "Demo Product", shortName: "Demo", logoUrl: "/product/assets/logo.svg", faviconUrl: null, signInArtUrl: "/product/assets/art.png", signInTitle: "Sign in", signInMessage: null, signUpUrl: "https://example.com/join" });
    expect(branding.links).toEqual({ website: "https://example.com" });
  });
});
