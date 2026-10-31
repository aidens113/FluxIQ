import type { PanelProduct } from "@fluxiq/contracts/platform";
import type { PanelOnboardingCard } from "./types.ts";

/** The panel's secrets page, where a model key is added. */
const SECRET_KEYS_HREF = "/programs/secret-keys";

/** The first-run cards: where to get the client, and adding a model key while none exists. */
export function panelOnboardingCards(input: { product: PanelProduct | null; hasModelKey: boolean }): readonly PanelOnboardingCard[] {
  const cards: PanelOnboardingCard[] = [];
  const stores = input.product?.extensionStores ?? [];
  if (stores.length > 0) {
    cards.push({
      id: "get-extension",
      title: "Get the extension",
      body: "Install the browser extension, then pair it with this workspace.",
      actions: stores.map((store) => ({ label: store.label, href: store.url, external: true }))
    });
  }
  if (!input.hasModelKey) {
    cards.push({
      id: "add-model-key",
      title: "Add your model key",
      body: "Flows are built with a model. Add a key for the provider you use.",
      actions: [{ label: "Add a key", href: SECRET_KEYS_HREF, external: false }]
    });
  }
  return cards;
}
