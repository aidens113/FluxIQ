// A tiny host module for the panel tests: sets a product, records one hook, supplies one email template.
import path from "node:path";
import { fileURLToPath } from "node:url";

export function registerFluxIQPlatform(platform) {
  platform.setProduct(
    {
      id: "fixture",
      name: "Fixture Product",
      shortName: "Fixture",
      assets: { logo: "logo.svg", favicon: "favicon.ico" },
      brand: { light: { primary: "#0b5cad", primaryHover: "#084a8a", focus: "#0b5cad" } }
    },
    { assetsDir: path.join(path.dirname(fileURLToPath(import.meta.url)), "assets") }
  );
  platform.on("account.created", (payload) => {
    (globalThis.__fluxiqFixtureHookLog ??= []).push({ event: "account.created", accountId: payload.accountId });
  });
  platform.registerEmailTemplate("welcome", { subject: "Welcome to {{product}}", text: "Open {{link}} to begin." });
}

export function registerFluxIQHost(fluxiq) {
  return fluxiq;
}
