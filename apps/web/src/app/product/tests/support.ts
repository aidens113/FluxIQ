import { fileURLToPath } from "node:url";
import { getPlatformRegistry, loadedHostModulesStore, resetPlatformRegistryForTests, type PanelProduct } from "fluxiq/platform/panel";
import { resetPlatformModulesLoadedForTests } from "../server";

export const FIXTURE_MODULE = fileURLToPath(new URL("../../../../../../packages/fluxiq/src/platform/panel/tests/fixtures/fixture-host-module.mjs", import.meta.url));
export const FIXTURE_ASSETS = fileURLToPath(new URL("../../../../../../packages/fluxiq/src/platform/panel/tests/fixtures/assets", import.meta.url));

/** A product with every field the panel pages read. */
export const FULL_PRODUCT: PanelProduct = {
  id: "full",
  name: "Full Product",
  shortName: "Full",
  assets: { logo: "logo.svg", favicon: "favicon.ico" },
  brand: { light: { primary: "#0b5cad", primaryHover: "#084a8a", focus: "#0b5cad" } },
  links: { terms: "https://example.test/terms", privacy: "https://example.test/privacy", support: "https://example.test/support" },
  auth: { signInTitle: "Welcome to Full", signInMessage: "Use your Full account.", signUpUrl: "https://example.test/signup" },
  extensionStores: [{ id: "chrome", label: "Chrome Web Store", url: "https://example.test/store" }]
};

/** Forgets the registry, the loaded-modules memo and the env, so each test starts with no product. */
export function resetPanelProductState(): void {
  resetPlatformRegistryForTests();
  loadedHostModulesStore.clear();
  resetPlatformModulesLoadedForTests();
  delete process.env.FLUXIQ_HOST_MODULE;
  delete process.env.NEXT_RUNTIME;
}

export function registerProduct(product: PanelProduct, assetsDir?: string): void {
  getPlatformRegistry().platform.setProduct(product, assetsDir ? { assetsDir } : undefined);
}
