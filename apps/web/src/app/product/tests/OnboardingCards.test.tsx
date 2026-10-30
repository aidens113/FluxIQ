import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ keys: [] as unknown[], fail: false }));
async function snapshot() {
  if (state.fail) throw new Error("locked");
  return { keys: state.keys };
}
vi.mock("../../../lib/fluxiq", () => ({
  getFluxIQ: () => ({ programs: { secretKeys: { snapshot } } })
}));
import { OnboardingCards } from "../server";
import { FULL_PRODUCT, registerProduct, resetPanelProductState } from "./support";

beforeEach(() => {
  state.keys = [];
  state.fail = false;
});
afterEach(resetPanelProductState);
const render = async () => renderToStaticMarkup(await OnboardingCards());

describe("onboarding cards", () => {
  it("render nothing for the stock panel, even without a key", async () => {
    expect(await render()).toBe("");
  });

  it("show the store card and the key card while no key exists", async () => {
    registerProduct(FULL_PRODUCT);
    const html = await render();
    expect(html).toContain("Get the extension");
    expect(html).toContain('href="https://example.test/store" rel="noopener noreferrer" target="_blank">Chrome Web Store</a>');
    expect(html).toContain("Add your model key");
    expect(html).toContain('href="/programs/secret-keys"');
  });

  it("hide the key card once a key exists", async () => {
    registerProduct(FULL_PRODUCT);
    state.keys = [{ id: "key.one" }];
    const html = await render();
    expect(html).toContain("Get the extension");
    expect(html).not.toContain("Add your model key");
  });

  it("render nothing when no card applies", async () => {
    registerProduct({ id: "bare", name: "Bare", shortName: "Bare" });
    state.keys = [{ id: "key.one" }];
    expect(await render()).toBe("");
  });

  it("treat an unreadable key list as having a key", async () => {
    registerProduct(FULL_PRODUCT);
    state.fail = true;
    expect(await render()).not.toContain("Add your model key");
  });
});
