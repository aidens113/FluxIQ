import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SecretKeysLive } from "../secret-keys";

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock("../../program-api", () => ({ useProgramApi: () => api }));
vi.mock("../../shared-ui", async (original) => ({
  ...await original<object>(),
  Modal: (props: any) => <section data-modal={props.title} data-close={props.onClose}>{props.children}</section>,
  Menu: (props: any) => <div>{props.options.map((option: any) => <button key={option.id} onClick={option.onSelect}>{option.label}</button>)}</div>,
  StatusText: (props: { value: string }) => <p>{props.value}</p>
}));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const user = { id: "test-user", pinConfigured: false, totpEnabled: false } as any;
const key = { id: "synthetic", name: "Synthetic key", provider: "Internal", kind: "custom", scope: "global", enabled: true, createdAtMs: 1, updatedAtMs: 2, lastRotatedAtMs: 2 };
let renderer: ReactTestRenderer;
const text = () => JSON.stringify(renderer.toJSON());
const label = (node: any): string => node.children.map((child: any) => typeof child === "string" ? child : label(child)).join("");
const button = (name: string) => renderer.root.findAllByType("button").find((node) => label(node) === name)!;
function deferred() { let resolve!: () => void, reject!: () => void; const promise = new Promise<void>((yes, no) => { resolve = yes; reject = () => no(new Error("synthetic clipboard detail")); }); void promise.catch(() => {}); return { promise, resolve: () => resolve(), reject: () => reject() }; }
async function reveal() {
  await act(async () => { renderer = create(<SecretKeysLive currentUser={user} />); });
  act(() => button("Reveal temporarily").props.onClick());
  act(() => renderer.root.findAllByType("input").find((input) => input.props.type === "password")!.props.onChange({ target: { value: "synthetic-password" } }));
  await act(async () => button("Reveal for 30 seconds").props.onClick());
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("window", { setTimeout, clearTimeout });
  api.get.mockReset().mockResolvedValue({ ok: true, payload: { keys: [key] } });
  api.post.mockReset().mockResolvedValue({ ok: true, payload: { value: "synthetic-value" } });
});
afterEach(() => { if (renderer) act(() => renderer.unmount()); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("Revealed secret clipboard feedback", () => {
  it("acknowledges copy only after clipboard completion and locks duplicate activation", async () => {
    const pending = deferred(), writeText = vi.fn(() => pending.promise);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    await reveal();
    act(() => { const copy = button("Copy").props.onClick; void copy(); void copy(); });
    expect(text()).not.toContain("Copied");
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith("synthetic-value");
    await act(async () => pending.resolve());
    expect(text()).toContain("Copied");
  });

  it("shows safe manual-copy guidance when clipboard access is missing", async () => {
    vi.stubGlobal("navigator", {});
    await reveal(); await act(async () => button("Copy").props.onClick());
    expect(text()).not.toContain("Copied");
    expect(text()).toContain("copy it manually");
    expect(text()).toContain("synthetic-value");
  });

  it("reports rejected copy locally without rendering the exception", async () => {
    const pending = deferred(); vi.stubGlobal("navigator", { clipboard: { writeText: () => pending.promise } });
    await reveal(); act(() => { void button("Copy").props.onClick(); });
    await act(async () => pending.reject());
    expect(text()).not.toContain("Copied");
    expect(text()).not.toContain("synthetic clipboard detail");
    expect(text()).toContain("copy it manually");
  });

  it("keeps expired reveal closed when an old copy finishes", async () => {
    const pending = deferred(); vi.stubGlobal("navigator", { clipboard: { writeText: () => pending.promise } });
    await reveal(); act(() => { void button("Copy").props.onClick(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(text()).not.toContain("synthetic-value");
    await act(async () => pending.resolve());
    expect(text()).not.toContain("Copied");
    expect(renderer.root.findAll((node) => node.props["data-modal"] === "Reveal Secret")).toHaveLength(0);
  });
});
