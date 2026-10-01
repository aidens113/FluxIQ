import React, { Profiler, useLayoutEffect } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { IdentityAccessLive } from "../identity-access";
const fixture = vi.hoisted(() => ({ api: { get: vi.fn(), post: vi.fn() } }));
vi.mock("../../program-api", () => ({ useProgramApi: () => fixture.api }));
vi.mock("../../shared-ui", async (original) => ({ ...await original<object>(),
  Modal: (props: any) => <section data-modal={props.title} data-close={props.onClose}>{props.children}</section>,
  Menu: (props: any) => <div data-menu={props.label}>{props.options.map((option: any) => <button disabled={option.disabled} key={option.id} onClick={option.onSelect}>{option.label}</button>)}</div>
}));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const actor = { id: "actor", displayName: "Actor", roleId: "admin", totpEnabled: false, pinConfigured: false };
const user = (id: string, roleId = "viewer") => ({ id, username: id, displayName: id, roleId, enabled: true, totpEnabled: false, createdAtMs: 1, updatedAtMs: 2 });
const initial = () => ({ users: [user("actor", "admin"), user("a"), user("b")], roles: [{ id: "admin", permissions: [] }, { id: "viewer", permissions: [] }], sessions: [], vault: { initialized: true, unlocked: false } });
let renderer: ReactTestRenderer | undefined, payload: any;
const label = (node: any): string => node.children.map((child: any) => typeof child === "string" ? child : label(child)).join("");
const text = () => JSON.stringify(renderer!.toJSON());
const button = (name: string) => renderer!.root.findAllByType("button").find((node) => label(node) === name)!;
const action = (name: string) => renderer!.root.findByProps({ "data-menu": "Actions for a" }).findAllByType("button").find((node) => label(node) === name)!;
const mount = async () => { await act(async () => { renderer = create(<Profiler id="identity" onRender={() => {}}><IdentityAccessLive currentUser={actor} /></Profiler>); }); };
function deferred() { let resolve!: (value: any) => void; return { promise: new Promise<any>((done) => { resolve = done; }), resolve }; }
beforeEach(() => { payload = initial(); fixture.api = { get: vi.fn(async () => ({ ok: true, payload })), post: vi.fn(async () => ({ ok: true })) }; });
afterEach(() => { if (renderer) act(() => renderer!.unmount()); renderer = undefined; vi.restoreAllMocks(); });

it.each(["api", "actor"])("masks old proof-bearing dialogs on %s replacement", async (kind) => {
  await mount(); act(() => action("Change password").props.onClick());
  act(() => renderer!.root.findAllByType("input").find((node) => node.props.type === "password")!.props.onChange({ target: { value: "synthetic-private-draft" } }));
  if (kind === "api") fixture.api = { get: vi.fn(async () => ({ ok: true, payload: initial() })), post: vi.fn() };
  const nextActor = kind === "actor" ? { ...actor, id: "new-actor" } : actor;
  const commits: string[] = [];
  await act(async () => renderer!.update(<Profiler id="identity" onRender={() => commits.push(text())}><IdentityAccessLive currentUser={nextActor} /></Profiler>));
  expect(text()).not.toContain("synthetic-private-draft"); expect(text()).not.toContain('data-modal');
  expect(commits[0]).not.toContain("synthetic-private-draft");
});
it.each(["refused", "rejected"])("offers direct retry for a %s initial read without private error text", async (kind) => {
  if (kind === "refused") fixture.api.get.mockResolvedValueOnce({ ok: false, error: "private" });
  else fixture.api.get.mockRejectedValueOnce(new Error("private"));
  await mount(); expect(text()).toContain("Identity metadata could not be loaded."); expect(text()).not.toContain("private");
  await act(async () => button("Retry").props.onClick()); expect(text()).toContain("Actions for a"); expect(fixture.api.post).not.toHaveBeenCalled();
});
it.each([{}, { users: null }, { users: [null] }, { roles: [{ id: "x", permissions: null }] }, { sessions: [null] }, { vault: null }, { vault: { initialized: true, unlocked: "true" } }])("keeps confirmed data and rejects malformed refreshed shape %j", async (change) => {
  await mount(); fixture.api.get.mockResolvedValue({ ok: true, payload: Object.keys(change).length ? { ...initial(), ...change } : {} });
  await act(async () => button("Refresh").props.onClick());
  expect(text()).toContain("Actions for a"); expect(text()).toContain("Identity metadata could not be loaded.");
});
it("accepts genuine empty collections with valid vault instead of inventing a read failure", async () => {
  payload = { ...initial(), users: [], roles: [], sessions: [] }; await mount();
  expect(text()).toContain("No users have been created."); expect(text()).not.toContain("Identity metadata could not be loaded.");
});
it("fences captured old menu/read/submit/close callbacks and late response on API replacement", async () => {
  await mount(); const oldMenu = action("Edit profile").props.onClick, oldRead = button("Refresh").props.onClick;
  act(() => oldMenu()); const oldSubmit = button("Save Profile").props.onClick, oldClose = renderer!.root.findByProps({ "data-modal": "Edit User Profile" }).props["data-close"];
  const pending = deferred(); const oldApi = fixture.api; oldApi.post.mockReturnValueOnce(pending.promise);
  act(() => void oldSubmit());
  fixture.api = { get: vi.fn(async () => ({ ok: true, payload: initial() })), post: vi.fn() };
  await act(async () => renderer!.update(<Profiler id="identity" onRender={() => {}}><IdentityAccessLive currentUser={actor} /></Profiler>));
  act(() => action("Edit profile").props.onClick());
  await act(async () => { oldMenu(); oldRead(); oldSubmit(); oldClose(); pending.resolve({ ok: true }); });
  expect(oldApi.post).toHaveBeenCalledTimes(1); expect(oldApi.get).toHaveBeenCalledTimes(1); expect(fixture.api.post).not.toHaveBeenCalled();
  expect(renderer!.root.findByProps({ "data-modal": "Edit User Profile" })).toBeDefined(); expect(text()).not.toContain("User updated");
});
it("locks duplicate profile writes and retains acknowledged receipt during pending reconciliation", async () => {
  await mount(); act(() => action("Edit profile").props.onClick()); const pending = deferred(); fixture.api.post.mockReturnValueOnce(pending.promise);
  act(() => { const submit = button("Save Profile").props.onClick; void submit(); void submit(); }); expect(fixture.api.post).toHaveBeenCalledTimes(1);
  const read = deferred(); fixture.api.get.mockReturnValueOnce(read.promise);
  await act(async () => pending.resolve({ ok: true })); expect(text()).toContain("User updated");
  await act(async () => read.resolve({ ok: false })); expect(button("Refresh").props.disabled).toBe(false); expect(text()).toContain("User updated");
});
it("ignores superseded explicit reads and aborts their signal", async () => {
  await mount(); const first = deferred(), second = deferred(); fixture.api.get.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
  const refresh = button("Refresh").props.onClick;
  act(() => { refresh(); refresh(); }); expect(fixture.api.get).toHaveBeenCalledTimes(3);
  expect(fixture.api.get.mock.calls[1]![1].signal.aborted).toBe(true);
  await act(async () => second.resolve({ ok: true, payload: { ...initial(), users: [user("new")] } }));
  await act(async () => first.resolve({ ok: true, payload: initial() })); expect(text()).toContain("Actions for new"); expect(text()).not.toContain("Actions for a");
});
it("guards retained callbacks during unmount commit before passive cleanup", async () => {
  let activate: (() => void) | undefined;
  function Probe({ visible }: { visible: boolean }) { useLayoutEffect(() => { if (!visible) activate?.(); }, [visible]); return visible ? <IdentityAccessLive currentUser={actor} /> : null; }
  await act(async () => { renderer = create(<Probe visible />); });
  act(() => action("Edit profile").props.onClick()); activate = button("Save Profile").props.onClick;
  await act(async () => renderer!.update(<Probe visible={false} />)); expect(fixture.api.post).not.toHaveBeenCalled();
});
it("does not refetch or clear profile drafts on cosmetic actor-name changes", async () => {
  await mount(); act(() => action("Edit profile").props.onClick());
  act(() => renderer!.root.findByProps({ "data-modal": "Edit User Profile" }).findAllByType("input")[0]!.props.onChange({ target: { value: "edited" } }));
  await act(async () => renderer!.update(<Profiler id="identity" onRender={() => {}}><IdentityAccessLive currentUser={{ ...actor, displayName: "Updated name" }} /></Profiler>));
  expect(text()).toContain("edited"); expect(fixture.api.get).toHaveBeenCalledTimes(1);
});
it("keeps acknowledged profile write and confirmed users when reconciliation fails", async () => {
  await mount(); act(() => action("Edit profile").props.onClick());
  fixture.api.get.mockResolvedValue({ ok: false, error: "private-read-error" });
  await act(async () => button("Save Profile").props.onClick());
  expect(text()).toContain("User updated"); expect(text()).toContain("Actions for a");
  expect(text()).not.toContain("private-read-error"); expect(button("Retry")).toBeDefined();
  expect(fixture.api.post).toHaveBeenCalledTimes(1);
});
it("treats malformed successful snapshot as a fixed recoverable read failure", async () => {
  fixture.api.get.mockResolvedValue({ ok: true, payload: null }); await mount();
  expect(text()).toContain("Identity metadata could not be loaded."); expect(button("Retry")).toBeDefined();
});
