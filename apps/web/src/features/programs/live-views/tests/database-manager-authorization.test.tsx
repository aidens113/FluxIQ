import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DatabaseManagerLive } from "../database-manager";

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
const scope = vi.hoisted(() => ({ current: undefined as { get: typeof api.get; post: typeof api.post } | undefined }));
vi.mock("../../program-api", () => ({ useProgramApi: () => scope.current ?? api }));
vi.mock("../../shared-ui", async (original) => ({
  ...await original<object>(),
  Modal: (props: any) => <section data-modal={props.title} data-close={props.onClose}>{props.children}</section>,
  StatusText: (props: { value: string }) => <p>{props.value}</p>
}));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
let renderer: ReactTestRenderer;
const user = { id: "test-user", pinConfigured: false, totpEnabled: false } as any;
const text = () => JSON.stringify(renderer.toJSON());
const modal = () => renderer.root.findAllByType("section").find((node) => node.props["data-modal"] === "Authorize Sensitive Store");
const password = () => modal()!.findAllByType("input").find((node) => node.props.type === "password")!;
const submit = () => modal()!.findAllByType("button").find((node) => node.children.includes("Authorize for 5 Minutes"))!;
const store = (index: number) => renderer.root.findAllByType("button").filter((node) => node.props.className?.includes("db-table-node"))[index]!;
const calls = () => api.post.mock.calls.filter((call) => call[0] === "authorize-store");
const grant = () => ({ ok: true, payload: { grantId: "synthetic-grant", expiresAtMs: Date.now() + 300_000 } });
function deferred() { let resolve!: (value: any) => void; let reject!: (error: unknown) => void; return { promise: new Promise<any>((yes, no) => { resolve = yes; reject = no; }), resolve: (value: any) => resolve(value), reject: (error: unknown) => reject(error) }; }
async function mount() { await act(async () => { renderer = create(<DatabaseManagerLive currentUser={user} />); }); act(() => store(0).props.onClick()); }
function enter() { act(() => password().props.onChange({ target: { value: "synthetic-password" } })); }
beforeEach(() => {
  scope.current = undefined;
  vi.stubGlobal("window", { setInterval: vi.fn(() => 1), clearInterval: vi.fn(), setTimeout, clearTimeout });
  api.get.mockReset().mockResolvedValue({ ok: true, payload: { stores: [{ kind: "secret.keys" }, { kind: "identity.users" }], databases: ["global", "domain-b"] } });
  api.post.mockReset().mockImplementation(async (action) => action === "authorize-store" ? grant() : { ok: true, payload: { records: [], total: 0, limit: 50, offset: 0 } });
});
afterEach(() => { if (renderer) act(() => renderer.unmount()); vi.unstubAllGlobals(); });

describe("Sensitive-store authorization", () => {
  it("locks duplicate activation synchronously and freezes submitted credentials", async () => {
    const pending = deferred(); api.post.mockImplementation((action) => action === "authorize-store" ? pending.promise : Promise.resolve({ ok: true }));
    await mount(); enter();
    act(() => { const activate = submit().props.onClick; void activate(); void activate(); });
    expect(calls()).toHaveLength(1);
    expect(submit().props.disabled).toBe(true);
    expect(password().props.disabled).toBe(true);
    await act(async () => pending.resolve(grant()));
    expect(modal()).toBeUndefined();
  });

  it("discards completion after closing and opening a fresh recheck", async () => {
    const pending = deferred(); api.post.mockReturnValue(pending.promise);
    await mount(); enter(); act(() => { void submit().props.onClick(); });
    act(() => modal()!.props["data-close"]());
    act(() => store(0).props.onClick());
    expect(password().props.value).toBe("");
    await act(async () => pending.resolve(grant()));
    expect(modal()).toBeDefined();
    expect(text()).not.toContain("Sensitive store authorized");
  });

  it("keeps a different store's recheck intact when the previous grant arrives", async () => {
    const pending = deferred(); api.post.mockReturnValue(pending.promise);
    await mount(); enter(); act(() => { void submit().props.onClick(); });
    act(() => store(3).props.onClick());
    expect(password().props.value).toBe("");
    await act(async () => pending.resolve(grant()));
    expect(modal()).toBeDefined();
    expect(text()).not.toContain("Sensitive store authorized");
    expect(api.post.mock.calls.some((call) => call[0] === "list-records")).toBe(false);
  });

  it("shows refusal inside the dialog and allows retry without clearing the current password", async () => {
    api.post.mockResolvedValueOnce({ ok: false, error: "synthetic private server detail" });
    await mount(); enter(); await act(async () => submit().props.onClick());
    expect(modal()!.findAll((node) => node.props.role === "alert")).not.toHaveLength(0);
    expect(text()).not.toContain("synthetic private server detail");
    expect(password().props.value).toBe("synthetic-password");
    expect(submit().props.disabled).toBe(false);
    await act(async () => submit().props.onClick());
    expect(modal()).toBeUndefined();
  });

  it("does not reuse credentials after navigating between stores", async () => {
    await mount(); enter(); act(() => store(1).props.onClick());
    expect(password().props.value).toBe("");
    expect(submit().props.disabled).toBe(true);
  });

  it.each([{ grantId: "expired", expiresAtMs: 1 }, { grantId: "", expiresAtMs: Date.now() + 300_000 }, { grantId: "bad-expiry", expiresAtMs: "tomorrow" }])("rejects malformed or expired success grants without unlocking the store (%j)", async (payload) => {
    api.post.mockResolvedValueOnce({ ok: true, payload });
    await mount(); enter(); await act(async () => submit().props.onClick());
    expect(modal()).toBeDefined();
    expect(modal()!.findAll((node) => node.props.role === "alert")).not.toHaveLength(0);
    expect(api.post.mock.calls.some((call) => call[0] === "list-records")).toBe(false);
  });

  it("catches request rejection locally and permits a fresh retry", async () => {
    const pending = deferred(); api.post.mockReturnValueOnce(pending.promise);
    await mount(); enter(); act(() => { void submit().props.onClick(); });
    await act(async () => pending.reject(new Error("synthetic-private-rejection")));
    expect(modal()!.findAll((node) => node.props.role === "alert")).not.toHaveLength(0);
    expect(text()).not.toContain("synthetic-private-rejection");
    expect(submit().props.disabled).toBe(false);
    await act(async () => submit().props.onClick());
    expect(modal()).toBeUndefined();
  });

  it("does not submit an obsolete handler after changing the authorization target", async () => {
    await mount(); enter(); const obsolete = submit().props.onClick;
    act(() => store(3).props.onClick()); enter();
    await act(async () => obsolete());
    expect(calls()).toHaveLength(0);
    await act(async () => submit().props.onClick());
    expect(calls()).toHaveLength(1);
    expect(calls()[0]![1]).toMatchObject({ kind: "identity.users", scope: { domainId: "domain-b" } });
  });

  it("keeps a new authorization pending when the old closed request fails", async () => {
    const previous = deferred(), next = deferred();
    api.post.mockImplementation((action) => action === "authorize-store" ? (calls().length === 1 ? previous.promise : next.promise) : Promise.resolve({ ok: true }));
    await mount(); enter(); act(() => { void submit().props.onClick(); });
    act(() => modal()!.props["data-close"]()); act(() => store(0).props.onClick()); enter();
    act(() => { void submit().props.onClick(); });
    await act(async () => previous.reject(new Error("old-private-error")));
    expect(submit().props.disabled).toBe(true);
    expect(text()).not.toContain("old-private-error");
    expect(modal()!.findAll((node) => node.props.role === "alert")).toHaveLength(0);
    await act(async () => next.resolve(grant()));
    expect(modal()).toBeUndefined();
  });

  it("clears credentials and ignores an old grant when the API domain scope changes", async () => {
    const pending = deferred(); api.post.mockReturnValue(pending.promise);
    await mount(); enter(); act(() => { void submit().props.onClick(); });
    scope.current = { get: vi.fn().mockResolvedValue(await api.get()), post: vi.fn().mockImplementation(async (action) => action === "authorize-store" ? grant() : { ok: true, payload: { records: [], total: 0, limit: 50, offset: 0 } }) };
    await act(async () => renderer.update(<DatabaseManagerLive currentUser={user} />));
    expect(modal()).toBeUndefined();
    act(() => store(0).props.onClick());
    expect(password().props.value).toBe("");
    await act(async () => pending.resolve(grant()));
    expect(modal()).toBeDefined();
    expect(text()).not.toContain("Sensitive store authorized");
    enter(); expect(submit().props.disabled).toBe(false);
    await act(async () => submit().props.onClick());
    expect(modal()).toBeUndefined();
    expect(scope.current.post).toHaveBeenCalledWith("authorize-store", expect.objectContaining({ kind: "secret.keys", authorizationPassword: "synthetic-password" }));
  });

  it("rejects captured activation after unmount", async () => {
    await mount(); enter(); const obsolete = submit().props.onClick;
    act(() => renderer.unmount());
    await obsolete();
    expect(calls()).toHaveLength(0);
  });

  it("does not carry an accepted grant into another API domain scope", async () => {
    await mount(); enter(); await act(async () => submit().props.onClick());
    expect(modal()).toBeUndefined();
    expect(api.post.mock.calls.some((call) => call[0] === "list-records" && call[1].grantId === "synthetic-grant")).toBe(true);
    scope.current = { get: vi.fn().mockResolvedValue(await api.get()), post: vi.fn() };
    await act(async () => renderer.update(<DatabaseManagerLive currentUser={user} />));
    expect(text()).toContain("Sensitive store locked");
    expect(scope.current.post).not.toHaveBeenCalled();
  });
});
