import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { SecretKeysLive } from "../secret-keys";
const owner = vi.hoisted(() => ({ api: { get: vi.fn(), post: vi.fn() }, automation: { get: vi.fn(), post: vi.fn() } }));
vi.mock("../../program-api", () => ({ useProgramApi: (id: string) => id === "secret-keys" ? owner.api : owner.automation }));
vi.mock("../../shared-ui", async original => ({ ...await original<object>(), Modal: (p: any) => <section data-modal={p.title} data-close={p.onClose}>{p.children}</section>, Menu: (p: any) => <div>{p.options.map((o: any) => <button key={o.id} onClick={o.onSelect}>{o.label}</button>)}</div> }));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const user = { id: "actor", displayName: "Actor", roleId: "admin", pinConfigured: false, totpEnabled: false };
const key = { id: "key", name: "Synthetic", kind: "custom", scope: "global", enabled: true, createdAtMs: 1, updatedAtMs: 2, lastRotatedAtMs: 2 };
let view: ReactTestRenderer;
const text = () => JSON.stringify(view.toJSON());
const label = (n: any): string => n.children.map((c: any) => typeof c === "string" ? c : label(c)).join("");
const button = (name: string) => view.root.findAllByType("button").find(n => label(n) === name)!;
function deferred() { let resolve!: (v: any) => void; const promise = new Promise<any>(done => { resolve = done; }); return { promise, resolve }; }
async function mount() { await act(async () => { view = create(<SecretKeysLive currentUser={user} />); }); }
function begin() { act(() => button("Reveal temporarily").props.onClick()); act(() => view.root.findAllByType("input").find(n => n.props.type === "password")!.props.onChange({ target: { value: "synthetic-proof" } })); }
beforeEach(() => { vi.useFakeTimers(); vi.stubGlobal("window", { setTimeout, clearTimeout, dispatchEvent() {} }); owner.api = { get: vi.fn().mockResolvedValue({ ok: true, payload: { keys: [key] } }), post: vi.fn().mockResolvedValue({ ok: true, payload: { value: "synthetic-revealed" } }) }; owner.automation = { get: vi.fn(), post: vi.fn() }; });
afterEach(() => { if (view) act(() => view.unmount()); vi.useRealTimers(); vi.unstubAllGlobals(); });
it("actual actor replacement hides revealed content and obsolete callbacks cannot request", async () => {
 await mount(); begin(); await act(async () => button("Reveal for 30 seconds").props.onClick()); const oldBegin = button("Reveal temporarily").props.onClick;
 await act(async () => view.update(<SecretKeysLive currentUser={{ ...user, id: "other" }} />)); expect(text()).not.toContain("synthetic-revealed"); act(() => oldBegin()); expect(view.root.findAll(n => n.props["data-modal"] === "Reveal Secret")).toHaveLength(0);
});
it("closed reveal cannot be resurrected by its pending acknowledgement", async () => {
 const pending = deferred(); owner.api.post.mockReturnValueOnce(pending.promise); await mount(); begin(); act(() => button("Reveal for 30 seconds").props.onClick()); act(() => view.root.findByProps({ "data-modal": "Reveal Secret" }).props["data-close"]()); await act(async () => pending.resolve({ ok: true, payload: { value: "synthetic-revealed" } })); expect(text()).not.toContain("synthetic-revealed"); expect(view.root.findAll(n => n.props["data-modal"] === "Reveal Secret")).toHaveLength(0);
});
it("old same-kind close cannot dismiss a fresh reveal dialog", async () => {
 await mount(); begin(); const close = view.root.findByProps({ "data-modal": "Reveal Secret" }).props["data-close"]; act(() => close()); begin(); act(() => close()); expect(view.root.findAll(n => n.props["data-modal"] === "Reveal Secret")).toHaveLength(1);
});

for (const change of ["secret-api", "automation-api", "actor", "factors"] as const) {
 it("owner or proof change invalidates pending reveal completion: " + change, async () => {
  const pending = deferred(); owner.api.post.mockReturnValueOnce(pending.promise); await mount(); begin(); const oldSubmit = button("Reveal for 30 seconds").props.onClick; act(() => oldSubmit()); const oldApi = owner.api;
  if (change === "secret-api") owner.api = { get: vi.fn().mockResolvedValue({ ok: true, payload: { keys: [key] } }), post: vi.fn() };
  if (change === "automation-api") owner.automation = { get: vi.fn(), post: vi.fn() };
  await act(async () => view.update(<SecretKeysLive currentUser={change === "actor" ? { ...user, id: "other" } : change === "factors" ? { ...user, pinConfigured: true } : user} />));
  await act(async () => { void oldSubmit(); pending.resolve({ ok: true, payload: { value: "synthetic-revealed" } }); }); expect(text()).not.toContain("synthetic-revealed"); expect(oldApi.post).toHaveBeenCalledTimes(1); expect(view.root.findAll(n => n.props["data-modal"] === "Reveal Secret")).toHaveLength(0);
 });
}
it("cosmetic actor label change preserves current revealed instance", async () => { await mount(); begin(); await act(async () => button("Reveal for 30 seconds").props.onClick()); await act(async () => view.update(<SecretKeysLive currentUser={{ ...user, displayName: "Renamed" }} />)); expect(text()).toContain("synthetic-revealed"); });
for (const payload of [undefined, {}, { value: {} }, { value: "synthetic-revealed", key: { ...key, id: "wrong" } }, { value: "synthetic-revealed", key: { ...key, lastRotatedAtMs: 3 } }]) {
 it("malformed or foreign reveal payload never publishes raw value", async () => { owner.api.post.mockResolvedValue({ ok: true, payload }); await mount(); begin(); await act(async () => button("Reveal for 30 seconds").props.onClick()); expect(text()).not.toContain("synthetic-revealed"); expect(text()).toContain("Secret reveal failed. Try again."); expect(button("Reveal for 30 seconds")).toBeDefined(); });
}
it("empty string is still a revealed instance rather than restored authorization", async () => { owner.api.post.mockResolvedValue({ ok: true, payload: { value: "" } }); await mount(); begin(); await act(async () => button("Reveal for 30 seconds").props.onClick()); expect(button("Copy")).toBeDefined(); expect(button("Reveal for 30 seconds")).toBeUndefined(); await act(async () => { await vi.advanceTimersByTimeAsync(30_000); }); expect(button("Copy")).toBeUndefined(); });
for (const replacement of [[], [{ ...key, lastRotatedAtMs: 3 }]]) {
 it("confirmed key removal or rotation masks reveal before passive effects", async () => {
  await mount(); begin(); await act(async () => button("Reveal for 30 seconds").props.onClick()); owner.api.get.mockResolvedValue({ ok: true, payload: { keys: replacement } }); await act(async () => button("Refresh").props.onClick()); expect(text()).not.toContain("synthetic-revealed"); expect(button("Copy")).toBeUndefined();
 });
}
it("filter that removes all visible keys immediately masks reveal", async () => { await mount(); begin(); await act(async () => button("Reveal for 30 seconds").props.onClick()); act(() => view.root.findByProps({ "aria-label": "Search secret keys" }).props.onChange({ target: { value: "no matching key" } })); expect(text()).not.toContain("synthetic-revealed"); expect(button("Copy")).toBeUndefined(); });
it("old close and expiry callback cannot hide a fresh equal-valued reveal", async () => {
 const callbacks: Array<() => void> = []; const real = window.setTimeout; window.setTimeout = ((callback: () => void, ms?: number) => { if (ms === 30_000) callbacks.push(callback); return real(callback, ms); }) as typeof window.setTimeout;
 await mount(); begin(); await act(async () => button("Reveal for 30 seconds").props.onClick()); const close = view.root.findByProps({ "data-modal": "Reveal Secret" }).props["data-close"]; act(() => close()); begin(); await act(async () => button("Reveal for 30 seconds").props.onClick()); act(() => { close(); callbacks[0]!(); }); expect(text()).toContain("synthetic-revealed"); await act(async () => { await vi.advanceTimersByTimeAsync(30_000); }); expect(text()).not.toContain("synthetic-revealed");
});
it("unexpected reveal rejection releases gate with fixed feedback and keeps explicit retry", async () => { owner.api.post.mockRejectedValueOnce(Error("synthetic private detail")); await mount(); begin(); await act(async () => button("Reveal for 30 seconds").props.onClick()); expect(text()).not.toContain("synthetic private detail"); expect(text()).toContain("Secret operation failed. Try again."); await act(async () => button("Reveal for 30 seconds").props.onClick()); expect(text()).toContain("synthetic-revealed"); });
it("unmount fences pending reveal and captured submit before request", async () => { const pending = deferred(); owner.api.post.mockReturnValueOnce(pending.promise); await mount(); begin(); const submit = button("Reveal for 30 seconds").props.onClick; act(() => submit()); act(() => view.unmount()); await act(async () => { void submit(); pending.resolve({ ok: true, payload: { value: "synthetic-revealed" } }); }); expect(owner.api.post).toHaveBeenCalledTimes(1); });

it("actor replacement removes reveal on the first commit before passive cleanup", async () => {
 const commits: string[] = []; let observe = false;
 const frame = (actor: typeof user) => <React.Profiler id="secret" onRender={() => { if (observe) commits.push(text()); }}><SecretKeysLive currentUser={actor} /></React.Profiler>;
 await act(async () => { view = create(frame(user)); }); begin(); await act(async () => button("Reveal for 30 seconds").props.onClick()); observe = true;
 await act(async () => view.update(frame({ ...user, id: "other" }))); expect(commits.length).toBeGreaterThan(0); expect(commits[0]).not.toContain("synthetic-revealed");
});
it("confirmed rotation removes reveal on first response commit before stale-dialog cleanup", async () => {
 const commits: string[] = []; let observe = false;
 await act(async () => { view = create(<React.Profiler id="secret" onRender={() => { if (observe) commits.push(text()); }}><SecretKeysLive currentUser={user} /></React.Profiler>); }); begin(); await act(async () => button("Reveal for 30 seconds").props.onClick());
 const pending = deferred(); owner.api.get.mockReturnValueOnce(pending.promise); act(() => button("Refresh").props.onClick()); observe = true;
 await act(async () => pending.resolve({ ok: true, payload: { keys: [{ ...key, lastRotatedAtMs: 3 }] } })); expect(commits.length).toBeGreaterThan(0); expect(commits[0]).not.toContain("synthetic-revealed");
});

it("acknowledged reveal refuses its obsolete submit and authorization change handlers", async () => {
 await mount(); begin(); const submit = button("Reveal for 30 seconds").props.onClick, change = view.root.findAllByType("input").find(n => n.props.type === "password")!.props.onChange;
 await act(async () => submit()); await act(async () => submit()); expect(owner.api.post).toHaveBeenCalledTimes(1); act(() => change({ target: { value: "obsolete proof" } })); expect(text()).toContain("synthetic-revealed"); expect(button("Reveal for 30 seconds")).toBeUndefined();
});
