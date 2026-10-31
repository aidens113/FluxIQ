import type { PanelProduct } from "@fluxiq/contracts/platform";
import { describe, expect, it } from "vitest";
import { panelOnboardingCards } from "../index.ts";

const WITH_STORES: PanelProduct = {
  id: "demo",
  name: "Demo",
  shortName: "Demo",
  extensionStores: [
    { id: "chrome", label: "Chrome Web Store", url: "https://example.com/chrome" },
    { id: "firefox", label: "Firefox Add-ons", url: "https://example.com/firefox" }
  ]
};

describe("panelOnboardingCards", () => {
  it("is empty with no product and a model key", () => {
    expect(panelOnboardingCards({ product: null, hasModelKey: true })).toEqual([]);
  });
  it("offers only the key card without a product or key", () => {
    const cards = panelOnboardingCards({ product: null, hasModelKey: false });
    expect(cards.map((card) => card.id)).toEqual(["add-model-key"]);
    expect(cards[0]!.actions).toEqual([{ label: "Add a key", href: "/programs/secret-keys", external: false }]);
  });
  it("offers one external action per store, then the key card", () => {
    const cards = panelOnboardingCards({ product: WITH_STORES, hasModelKey: false });
    expect(cards.map((card) => card.id)).toEqual(["get-extension", "add-model-key"]);
    expect(cards[0]!.actions).toEqual([
      { label: "Chrome Web Store", href: "https://example.com/chrome", external: true },
      { label: "Firefox Add-ons", href: "https://example.com/firefox", external: true }
    ]);
  });
  it("drops the key card once a key exists, and offers no extension card without stores", () => {
    expect(panelOnboardingCards({ product: WITH_STORES, hasModelKey: true }).map((card) => card.id)).toEqual(["get-extension"]);
    expect(panelOnboardingCards({ product: { id: "demo", name: "Demo", shortName: "Demo" }, hasModelKey: true })).toEqual([]);
  });
});
