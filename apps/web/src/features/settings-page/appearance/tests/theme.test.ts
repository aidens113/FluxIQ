import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyTheme, parseTheme, readTheme, themeInitScript, themeStorageKey } from "..";

const store = new Map<string, string>();
const root = new Map<string, string>();

beforeEach(() => {
  store.clear();
  root.clear();
  vi.stubGlobal("window", { localStorage: { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => void store.set(key, value) } });
  vi.stubGlobal("localStorage", (window as unknown as { localStorage: Storage }).localStorage);
  vi.stubGlobal("document", { documentElement: { setAttribute: (name: string, value: string) => void root.set(name, value) } });
});
afterEach(() => vi.unstubAllGlobals());

describe("the panel's appearance", () => {
  it("follows the device unless a known choice is given", () => {
    expect(parseTheme(undefined)).toBe("system");
    expect(parseTheme("purple")).toBe("system");
    expect(parseTheme("light")).toBe("light");
    expect(parseTheme("dark")).toBe("dark");
    expect(readTheme()).toBe("system");
  });

  it("applies a choice to the root element and remembers it", () => {
    expect(applyTheme("light")).toBe(true);
    expect(root.get("data-theme")).toBe("light");
    expect(store.get(themeStorageKey)).toBe("light");
    expect(readTheme()).toBe("light");
  });

  it("follows the device, and does not throw, when storage is blocked", () => {
    vi.stubGlobal("window", { get localStorage(): never { throw new Error("blocked"); } });
    expect(readTheme()).toBe("system");
    expect(applyTheme("system")).toBe(false);
    expect(root.get("data-theme")).toBe("system");
  });

  it("is applied before paint by the inline script, from the stored choice", () => {
    store.set(themeStorageKey, "system");
    new Function(themeInitScript)();
    expect(root.get("data-theme")).toBe("system");
    store.set(themeStorageKey, "dark");
    new Function(themeInitScript)();
    expect(root.get("data-theme")).toBe("dark");
    store.set(themeStorageKey, "garbage");
    new Function(themeInitScript)();
    expect(root.get("data-theme")).toBe("system");
  });
});
