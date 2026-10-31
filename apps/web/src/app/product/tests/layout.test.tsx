import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../globals.css", () => ({}));
vi.mock("../../styles/product-branding.css", () => ({}));
vi.mock("../../../lib/auth", () => ({ currentFluxIQUser: async () => null }));
vi.mock("../../GlobalClientGatewayPairing", () => ({ GlobalClientGatewayPairing: () => null }));
vi.mock("../../GlobalConversationPrompt", () => ({ GlobalConversationPrompt: () => null }));
vi.mock("../../session-reauthentication", () => ({ SessionReauthentication: () => null }));
vi.mock("../../../features/programs/shared-ui", () => ({ GlobalAlertViewport: () => null }));
import RootLayout, { generateMetadata } from "../../layout";
import { FULL_PRODUCT, registerProduct, resetPanelProductState } from "./support";

afterEach(resetPanelProductState);

describe("the root layout", () => {
  it("keeps the stock title, description and bare <html> without a product", async () => {
    expect(await generateMetadata()).toEqual({ title: "FluxIQ", description: "Domain-neutral automation framework control panel" });
    const html = renderToStaticMarkup(await RootLayout({ children: <main>Page</main> }));
    expect(html).toContain("<html lang=\"en\"><head></head><body>");
    expect(html).not.toContain("style=");
  });

  it("brands the title, favicon and accent variables from the product", async () => {
    registerProduct(FULL_PRODUCT);
    expect(await generateMetadata()).toEqual({ title: "Full", description: "Domain-neutral automation framework control panel", icons: { icon: "/product/assets/favicon.ico" } });
    const html = renderToStaticMarkup(await RootLayout({ children: <main>Page</main> }));
    expect(html).toContain('<html lang="en" style="--color-primary:#0b5cad;--color-primary-hover:#084a8a;--color-focus:#0b5cad">');
  });
});
