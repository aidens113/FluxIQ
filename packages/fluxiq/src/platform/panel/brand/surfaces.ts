/** The panel's own surfaces per mode, which a product's accents are checked against. The panel has no dark theme at launch, so dark accents are validated but not applied. */
export const PANEL_BRAND_SURFACES = Object.freeze({
  light: Object.freeze({ surface: "#ffffff", background: "#f2f3f3" }),
  dark: Object.freeze({ surface: "#111820", background: "#0b0f14" })
});
