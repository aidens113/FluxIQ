import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConnectDone } from "..";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => vi.unstubAllGlobals());

describe("connection handoff display", () => {
  it("never shows/stores/messages the code or clears the URL before the extension can observe it", async () => {
    const code = "c".repeat(43);
    const postMessage = vi.fn();
    const setItem = vi.fn();
    const replaceState = vi.fn();
    const fetch = vi.fn();
    const href = `https://app.example.test/connect/done#code=${code}&state=synthetic-state-0123456789`;
    vi.stubGlobal("window", { location: { href }, postMessage, history: { replaceState }, localStorage: { setItem }, sessionStorage: { setItem } });
    vi.stubGlobal("fetch", fetch);
    let renderer!: ReactTestRenderer;
    await act(async () => { renderer = create(<ConnectDone origin="https://app.example.test" />); });
    const rendered = JSON.stringify(renderer.toJSON());
    expect(rendered).toContain("finish connecting");
    expect(rendered).not.toContain(code);
    expect(rendered).not.toContain("connected successfully");
    expect(postMessage).not.toHaveBeenCalled();
    expect(setItem).not.toHaveBeenCalled();
    expect(replaceState).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    await act(async () => renderer.unmount());
  });
});
