import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ClipboardButton } from "..";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
let renderer: ReactTestRenderer;
const button = () => renderer.root.findByType("button");
const text = () => JSON.stringify(renderer.toJSON());
async function mount(value = "synthetic-one") { await act(async () => { renderer = create(<ClipboardButton value={value} />); }); }
function deferred() { let resolve!: () => void, reject!: (error: unknown) => void; return { promise: new Promise<void>((yes, no) => { resolve = yes; reject = no; }), resolve: () => resolve(), reject: () => reject(new Error("synthetic-private-exception")) }; }
beforeEach(() => vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } }));
afterEach(() => { if (renderer) act(() => renderer.unmount()); vi.unstubAllGlobals(); });

describe("ClipboardButton lifecycle", () => {
  it("preserves an explicit accessible name for icon-only presentation", async () => {
    await act(async () => { renderer = create(<ClipboardButton value="synthetic-one" accessibleLabel="Copy source" iconOnly />); });
    expect(button().props["aria-label"]).toBe("Copy source");
    expect(button().props.title).toBe("Copy source");
    expect(button().props.className).toBe("icon-button");
    await act(async () => button().props.onClick());
    expect(renderer.root.findByProps({ role: "status" }).children.join("")).toBe("Copied to clipboard.");
    expect(button().props["aria-label"]).toBe("Copy source");
  });
  it("waits for acknowledgement and prevents duplicate writes", async () => {
    const pending = deferred(), writeText = vi.fn(() => pending.promise);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    await mount(); act(() => { const activate = button().props.onClick; activate(); activate(); });
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(button().props.disabled).toBe(true);
    expect(text()).not.toContain("Copied");
    await act(async () => pending.resolve());
    expect(button().props.disabled).toBe(false);
    expect(text()).toContain("Copied to clipboard");
    expect(text()).not.toContain("synthetic-one");
  });

  it.each([undefined, {}, { clipboard: {} }])("offers manual copy when clipboard is unavailable (%j)", async (navigator) => {
    vi.stubGlobal("navigator", navigator);
    await mount(); await act(async () => button().props.onClick());
    expect(text()).toContain("copy it manually");
    expect(text()).not.toContain("Copied");
    expect(button().props.disabled).toBe(false);
  });

  it("catches both synchronous and asynchronous write failures and permits retry", async () => {
    const writeText = vi.fn().mockImplementationOnce(() => { throw new Error("synthetic-private-exception"); }).mockRejectedValueOnce(new Error("synthetic-private-exception")).mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    await mount();
    for (let attempt = 0; attempt < 2; attempt++) {
      await act(async () => button().props.onClick());
      expect(text()).toContain("copy it manually");
      expect(text()).not.toContain("synthetic-private-exception");
      expect(text()).not.toContain("Copied");
    }
    await act(async () => button().props.onClick());
    expect(text()).toContain("Copied to clipboard");
    expect(writeText).toHaveBeenCalledTimes(3);
  });

  it("rejects an obsolete activation and does not let old completion overwrite a newer pending copy", async () => {
    const old = deferred(), next = deferred(), writeText = vi.fn().mockReturnValueOnce(old.promise).mockReturnValueOnce(next.promise);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    await mount(); const obsolete = button().props.onClick;
    act(() => obsolete());
    act(() => renderer.update(<ClipboardButton value="synthetic-two" />));
    expect(button().props.disabled).toBe(false);
    act(() => { obsolete(); button().props.onClick(); });
    expect(writeText.mock.calls.map((call) => call[0])).toEqual(["synthetic-one", "synthetic-two"]);
    await act(async () => old.resolve());
    expect(text()).not.toContain("Copied");
    expect(button().props.disabled).toBe(true);
    await act(async () => next.resolve());
    expect(text()).toContain("Copied to clipboard");
  });

  it("clears acknowledged feedback immediately when the displayed value changes", async () => {
    await mount(); await act(async () => button().props.onClick());
    expect(text()).toContain("Copied");
    act(() => renderer.update(<ClipboardButton value="synthetic-two" />));
    expect(text()).not.toContain("Copied");
    expect(button().props.disabled).toBe(false);
  });

  it("ignores pending failure and captured activation after unmount", async () => {
    const pending = deferred(), writeText = vi.fn(() => pending.promise);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    await mount(); const obsolete = button().props.onClick;
    act(() => obsolete()); act(() => renderer.unmount());
    await act(async () => { obsolete(); pending.reject(); });
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(renderer.toJSON()).toBeNull();
  });

  it("does not write an empty displayed value", async () => {
    await mount("");
    expect(button().props.disabled).toBe(true);
    await act(async () => button().props.onClick());
    expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
  });
});
