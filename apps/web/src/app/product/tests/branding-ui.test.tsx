import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { checkPanelBrandContrast, getPlatformRegistry, panelBranding } from "fluxiq/platform/panel";
import { GlobalTopbar, LoginPanel } from "../../AuthShell";
import { PanelBrandingProvider, STOCK_PANEL_BRANDING } from "../client";
import { currentPanelBranding, ensurePlatformModulesLoaded } from "../server";
import { FIXTURE_MODULE, FULL_PRODUCT, registerProduct, resetPanelProductState } from "./support";

const user = { displayName: "Operator", roleId: "admin" };
const topbar = <GlobalTopbar user={user} />;

afterEach(resetPanelProductState);

describe("panel branding", () => {
  it("keeps the client default equal to the stock branding", () => {
    expect(STOCK_PANEL_BRANDING).toEqual(panelBranding(null));
  });

  it("renders stock markup, unchanged, with no product", () => {
    const bare = renderToStaticMarkup(<><LoginPanel />{topbar}</>);
    const provided = renderToStaticMarkup(<PanelBrandingProvider branding={panelBranding(null)}><LoginPanel />{topbar}</PanelBrandingProvider>);
    expect(provided).toBe(bare);
    expect(bare).toContain('aria-label="FluxIQ programs"');
    expect(bare).toContain('class="brand-mark"');
    expect(bare).toContain("<span>FluxIQ</span>");
    expect(bare).toContain('<strong id="auth-title">FluxIQ</strong><small>Sign in to continue</small>');
    expect(bare).not.toContain("product-auth-links");
    expect(bare).not.toContain("<img");
  });

  it("loads the fixture host module only when asked to, in the Node runtime", async () => {
    process.env.FLUXIQ_HOST_MODULE = FIXTURE_MODULE;
    await ensurePlatformModulesLoaded();
    expect(getPlatformRegistry().product()).toBeNull();
    resetPanelProductState();
    process.env.FLUXIQ_HOST_MODULE = FIXTURE_MODULE;
    process.env.NEXT_RUNTIME = "nodejs";
    const branding = await currentPanelBranding();
    expect(branding).toMatchObject({ name: "Fixture Product", shortName: "Fixture", logoUrl: "/product/assets/logo.svg", faviconUrl: "/product/assets/favicon.ico" });
    expect(branding.style).toEqual({ "--color-primary": "#0b5cad", "--color-primary-hover": "#084a8a", "--color-focus": "#0b5cad" });
    expect(await currentPanelBranding()).toEqual(branding);
  });

  it("shows the product's name and logo in the topbar", () => {
    registerProduct(FULL_PRODUCT);
    const branding = panelBranding(getPlatformRegistry().product());
    const html = renderToStaticMarkup(<PanelBrandingProvider branding={branding}>{topbar}</PanelBrandingProvider>);
    expect(html).toContain('aria-label="Full Product programs"');
    expect(html).toContain('<img alt="Full Product" class="brand-logo" height="28" src="/product/assets/logo.svg" width="28"/>');
    expect(html).toContain("<span>Full Product</span>");
    expect(html).not.toContain('class="brand-mark"');
  });

  it("shows sign-in copy, the sign-up link and footer links on the login panel", () => {
    registerProduct(FULL_PRODUCT);
    const branding = panelBranding(getPlatformRegistry().product());
    const html = renderToStaticMarkup(<PanelBrandingProvider branding={branding}><LoginPanel /></PanelBrandingProvider>);
    expect(html).toContain("Welcome to Full");
    expect(html).toContain("Use your Full account.");
    expect(html).toContain('<a href="https://example.test/signup" rel="noopener noreferrer">Create an account</a>');
    for (const [label, url] of [["Terms", "terms"], ["Privacy", "privacy"], ["Support", "support"]]) {
      expect(html).toContain(`<a href="https://example.test/${url}" rel="noopener noreferrer" target="_blank">${label}</a>`);
    }
    expect(html).toContain('src="/product/assets/logo.svg"');
  });

  it("keeps the fixture's accents within the contrast rules", () => {
    expect(checkPanelBrandContrast(FULL_PRODUCT).ok).toBe(true);
    registerProduct({ id: "fx", name: "Fx", shortName: "Fx", brand: { light: { primary: "#0b5cad", primaryHover: "#084a8a", focus: "#0b5cad" } } });
    expect(checkPanelBrandContrast(getPlatformRegistry().product()!).ok).toBe(true);
  });
});
