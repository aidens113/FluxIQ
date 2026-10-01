import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { IdentityAccessLive } from "../identity-access";
const fixture = vi.hoisted(() => ({ api: { get: vi.fn(), post: vi.fn() } }));
vi.mock("../../program-api", () => ({ useProgramApi: () => fixture.api }));
vi.mock("../../shared-ui", async (original) => ({ ...await original<object>(),
  Modal: (props: any) => <section data-modal={props.title} data-close={props.onClose} data-description={props.description}>{props.children}</section>,
  Menu: (props: any) => <div data-menu={props.label}>{props.options.map((option: any) => <button disabled={option.disabled} key={option.id} onClick={option.onSelect}>{option.label}</button>)}</div>
}));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const actor = { id: "actor", displayName: "Actor", roleId: "admin", totpEnabled: false, pinConfigured: false };
const user = (id: string, roleId = "viewer") => ({ id, username: id, displayName: id, roleId, enabled: true, totpEnabled: false, createdAtMs: 1, updatedAtMs: 2 });
let renderer: ReactTestRenderer | undefined, payload: any;
const label = (node: any): string => node.children.map((child: any) => typeof child === "string" ? child : label(child)).join("");
const button = (name: string) => renderer!.root.findAllByType("button").find((node) => label(node) === name)!;
const action = (name: string) => renderer!.root.findByProps({ "data-menu": "Actions for a" }).findAllByType("button").find((node) => label(node) === name)!;
const row = (id: string) => renderer!.root.findAllByType("button").find((node) => node.props.className === "identity-user-link" && label(node) === id + "@" + id)!;
const text = () => JSON.stringify(renderer!.toJSON());
const mount = async () => { await act(async () => { renderer = create(<IdentityAccessLive currentUser={actor} />); }); };
beforeEach(() => {
  payload = { users: [user("actor", "admin"), user("a"), user("b")], roles: [{ id: "admin", permissions: [] }, { id: "viewer", permissions: [] }], sessions: [], vault: { initialized: true, unlocked: false } };
  fixture.api = { get: vi.fn(async () => ({ ok: true, payload })), post: vi.fn(async () => ({ ok: true })) };
});
afterEach(() => { if (renderer) act(() => renderer!.unmount()); renderer = undefined; vi.unstubAllGlobals(); });
it.each(["password", "pin"])("binds %s replacement to the dialog subject despite retained background selection", async (kind) => {
  await mount(); const selectB = row("b").props.onClick;
  act(() => action(kind === "password" ? "Change password" : "Change PIN").props.onClick());
  const passwords = renderer!.root.findByProps({ "data-modal": kind === "password" ? "Change password" : "Change pin" }).findAllByType("input");
  act(() => { passwords[0]!.props.onChange({ target: { value: kind === "password" ? "new-value" : "1234" } }); });
  act(() => passwords[1]!.props.onChange({ target: { value: kind === "password" ? "new-value" : "1234" } }));
  act(() => passwords[2]!.props.onChange({ target: { value: "synthetic-auth" } }));
  act(() => selectB()); await act(async () => button("Save Credential").props.onClick());
  expect(fixture.api.post).toHaveBeenLastCalledWith(kind === "password" ? "set-password" : "set-pin", expect.objectContaining({ userId: "a" }));
});
const passwordDraft = () => {
  act(() => action("Change password").props.onClick());
  for (const [index, value] of ["new-value", "new-value", "synthetic-auth"].entries()) act(() => renderer!.root.findByProps({ "data-modal": "Change password" }).findAllByType("input")[index]!.props.onChange({ target: { value } }));
};
it("masks a disappeared credential subject and refuses its retained submit without retargeting", async () => {
  await mount(); passwordDraft(); const submit = button("Save Credential").props.onClick;
  payload = { ...payload, users: payload.users.filter((item: any) => item.id !== "a") };
  await act(async () => button("Refresh").props.onClick());
  expect(renderer!.root.findAll((node) => node.props["data-modal"] === "Change password")).toHaveLength(0);
  await act(async () => submit()); expect(fixture.api.post).not.toHaveBeenCalled(); expect(text()).not.toContain("new-value");
});
it("keeps same-owner refused credential drafts and recheck guidance for direct retry", async () => {
  fixture.api.post.mockResolvedValueOnce({ ok: false, requiresRecheck: true, error: "Fresh proof needed." });
  await mount(); passwordDraft(); await act(async () => button("Save Credential").props.onClick());
  expect(text()).toContain("new-value"); expect(text()).toContain("Enter your current security factors and try again.");
  await act(async () => button("Save Credential").props.onClick()); expect(fixture.api.post).toHaveBeenCalledTimes(2);
});
it("recovers unexpected credential rejection with fixed local feedback", async () => {
  fixture.api.post.mockRejectedValueOnce(new Error("private-provider-exception"));
  await mount(); passwordDraft(); await act(async () => button("Save Credential").props.onClick());
  expect(text()).toContain("The identity operation could not be completed. Try again."); expect(text()).not.toContain("private-provider-exception");
  await act(async () => button("Save Credential").props.onClick()); expect(fixture.api.post).toHaveBeenCalledTimes(2);
});
it("fences obsolete input/close/submit handlers from an earlier credential dialog", async () => {
  await mount(); passwordDraft();
  const oldSubmit = button("Save Credential").props.onClick, oldClose = renderer!.root.findByProps({ "data-modal": "Change password" }).props["data-close"], oldInput = renderer!.root.findByProps({ "data-modal": "Change password" }).findAllByType("input")[0]!.props.onChange;
  act(() => button("Cancel").props.onClick()); passwordDraft();
  await act(async () => { oldInput({ target: { value: "old-edit" } }); oldClose(); oldSubmit(); });
  expect(text()).toContain("new-value"); expect(text()).not.toContain("old-edit"); expect(fixture.api.post).not.toHaveBeenCalled();
});
it("does not close a replacement credential dialog after an old issued write finishes", async () => {
  await mount(); passwordDraft(); let resolve!: (value: any) => void; fixture.api.post.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
  const close = renderer!.root.findByProps({ "data-modal": "Change password" }).props["data-close"];
  act(() => void button("Save Credential").props.onClick());
  // Retained/programmatic callbacks model an obsolete epoch, not an enabled normal Cancel gesture.
  act(() => close());
  // The old retained close is itself fenced; replace through a current synthetic menu action.
  act(() => action("Change PIN").props.onClick());
  await act(async () => resolve({ ok: true }));
  expect(renderer!.root.findByProps({ "data-modal": "Change pin" })).toBeDefined(); expect(text()).not.toContain("password updated");
});
it.each(["actor", "factor"])("invalidates proof and retained submit on %s changes", async (kind) => {
  await mount(); passwordDraft(); const submit = button("Save Credential").props.onClick;
  await act(async () => renderer!.update(<IdentityAccessLive currentUser={kind === "actor" ? { ...actor, id: "other-actor" } : { ...actor, totpEnabled: true }} />));
  await act(async () => submit()); expect(fixture.api.post).not.toHaveBeenCalled(); expect(text()).not.toContain("new-value");
});
async function enrollment() {
  act(() => action("Set up 2FA").props.onClick());
  act(() => renderer!.root.findByProps({ "data-modal": "Set Up Two-Factor Authentication" }).findAllByType("input")[0]!.props.onChange({ target: { value: "synthetic-auth" } }));
  await act(async () => button("Continue").props.onClick());
}
const material = { secret: "synthetic-manual-key", otpauthUrl: "otpauth://synthetic", qrSvg: "<svg></svg>", issuer: "synthetic", accountLabel: "a" };
it("binds TOTP confirmation and manual-key copying to the enrolled subject", async () => {
  fixture.api.post.mockResolvedValueOnce({ ok: true, payload: material });
  const writeText = vi.fn(async () => {}); vi.stubGlobal("navigator", { clipboard: { writeText } });
  await mount(); await enrollment(); expect(text()).toContain("synthetic-manual-key");
  await act(async () => button("Copy").props.onClick()); expect(writeText).toHaveBeenCalledWith("synthetic-manual-key");
  act(() => renderer!.root.findByProps({ "data-modal": "Set Up Two-Factor Authentication" }).findAllByType("input")[0]!.props.onChange({ target: { value: "123456" } }));
  const selectB = row("b").props.onClick; act(() => selectB());
  expect(renderer!.root.findByProps({ "data-modal": "Set Up Two-Factor Authentication" }).props["data-description"]).toBe("Enroll an authenticator for a.");
  await act(async () => button("Enable 2FA").props.onClick());
  expect(fixture.api.post).toHaveBeenLastCalledWith("confirm-totp", { userId: "a", code: "123456", authorizationPassword: "synthetic-auth", authorizationPin: "", authorizationTotp: "" });
  expect(text()).not.toContain("synthetic-manual-key");
});
it("invalidates disappeared enrollment subject and its retained confirm", async () => {
  fixture.api.post.mockResolvedValueOnce({ ok: true, payload: material }); await mount(); await enrollment();
  act(() => renderer!.root.findByProps({ "data-modal": "Set Up Two-Factor Authentication" }).findAllByType("input")[0]!.props.onChange({ target: { value: "123456" } }));
  const confirm = button("Enable 2FA").props.onClick;
  payload = { ...payload, users: payload.users.filter((item: any) => item.id !== "a") }; await act(async () => button("Refresh").props.onClick());
  await act(async () => confirm()); expect(fixture.api.post).toHaveBeenCalledTimes(1); expect(text()).not.toContain("synthetic-manual-key");
});
it.each([null, {}, { ...material, secret: 1 }])("recovers malformed TOTP setup without presenting secret material (%j)", async (value) => {
  fixture.api.post.mockResolvedValueOnce({ ok: true, payload: value }); await mount(); await enrollment();
  expect(text()).toContain("2FA setup could not be loaded."); expect(text()).not.toContain("synthetic-manual-key");
});
it("preserves final-enabled-admin restrictions and refuses captured disabled role action", async () => {
  await mount(); const adminMenu = renderer!.root.findByProps({ "data-menu": "Actions for actor" });
  for (const name of ["Change role", "Disable user"]) {
    const entry = adminMenu.findAllByType("button").find((node) => label(node) === name)!; expect(entry.props.disabled).toBe(true);
    act(() => entry.props.onClick());
  }
  // Native disabled behavior is not emulated by the local adapter; source submit must independently protect the final admin.
  const inputs = renderer!.root.findAllByType("input").filter((node) => node.props.type === "password");
  if (inputs.length) act(() => inputs[0]!.props.onChange({ target: { value: "synthetic-auth" } }));
  const submit = renderer!.root.findAllByType("button").find((node) => ["Save Role", "Disable User"].includes(label(node)));
  if (submit) await act(async () => submit.props.onClick()); expect(fixture.api.post).not.toHaveBeenCalled();
});
it("preserves the authorized create-user envelope and clears the completed draft", async () => {
  await mount(); act(() => button("Add User").props.onClick());
  for (const [index, value] of ["created", "Created User", "temporary", "", "synthetic-auth"].entries()) {
    act(() => renderer!.root.findByProps({ "data-modal": "Add User" }).findAllByType("input").filter((node) => node.props.type !== "checkbox")[index]!.props.onChange({ target: { value } }));
  }
  await act(async () => button("Create User").props.onClick());
  expect(fixture.api.post).toHaveBeenLastCalledWith("create-user", { username: "created", displayName: "Created User", roleId: "viewer", password: "temporary", pin: "", enabled: true, authorizationPassword: "synthetic-auth", authorizationPin: "", authorizationTotp: "" });
  expect(renderer!.root.findAll((node) => node.props["data-modal"] === "Add User")).toHaveLength(0);
});
it("preserves subject-specific role and enabled mutation envelopes", async () => {
  await mount(); act(() => action("Change role").props.onClick());
  act(() => renderer!.root.findByProps({ "data-modal": "Change Role" }).findByType("select").props.onChange({ target: { value: "admin" } }));
  act(() => renderer!.root.findByProps({ "data-modal": "Change Role" }).findByType("input").props.onChange({ target: { value: "synthetic-auth" } }));
  await act(async () => button("Save Role").props.onClick());
  expect(fixture.api.post).toHaveBeenLastCalledWith("update-user", { id: "a", roleId: "admin", authorizationPassword: "synthetic-auth", authorizationPin: "", authorizationTotp: "" });
  act(() => action("Disable user").props.onClick());
  act(() => renderer!.root.findByProps({ "data-modal": "Disable User" }).findByType("input").props.onChange({ target: { value: "synthetic-auth" } }));
  await act(async () => button("Disable User").props.onClick());
  expect(fixture.api.post).toHaveBeenLastCalledWith("update-user", { id: "a", enabled: false, authorizationPassword: "synthetic-auth", authorizationPin: "", authorizationTotp: "" });
});
it("preserves authorized disable-TOTP subject and factors", async () => {
  payload.users[1].totpEnabled = true; await mount(); act(() => action("Disable 2FA").props.onClick());
  const dialog = () => renderer!.root.findByProps({ "data-modal": "Disable Two-Factor Authentication" });
  act(() => dialog().findByType("input").props.onChange({ target: { value: "synthetic-auth" } }));
  await act(async () => dialog().findAllByType("button").find((node) => label(node) === "Disable 2FA")!.props.onClick());
  expect(fixture.api.post).toHaveBeenLastCalledWith("disable-totp", { userId: "a", authorizationPassword: "synthetic-auth", authorizationPin: "", authorizationTotp: "", error: "" });
});
it("keeps disable-TOTP description and mutation bound to its subject after selection changes", async () => {
  payload.users[1].totpEnabled = true; await mount(); act(() => action("Disable 2FA").props.onClick());
  act(() => row("b").props.onClick());
  const dialog = () => renderer!.root.findByProps({ "data-modal": "Disable Two-Factor Authentication" });
  expect(dialog().props["data-description"]).toBe("Remove authenticator protection from a.");
  act(() => dialog().findByType("input").props.onChange({ target: { value: "synthetic-auth" } }));
  await act(async () => dialog().findAllByType("button").find((node) => label(node) === "Disable 2FA")!.props.onClick());
  expect(fixture.api.post).toHaveBeenLastCalledWith("disable-totp", expect.objectContaining({ userId: "a" }));
});
it.each([null, {}, { ok: "true" }, { ok: false, error: {} }])("recovers malformed credential mutation envelopes (%j)", async (result) => {
  fixture.api.post.mockResolvedValueOnce(result); await mount(); passwordDraft();
  await act(async () => button("Save Credential").props.onClick()); expect(text()).toContain("The identity operation could not be completed. Try again."); expect(text()).toContain("new-value");
});
it("revalidates newly configured actor PIN before accepting old proof", async () => {
  await mount(); passwordDraft(); const old = button("Save Credential").props.onClick;
  payload.users[0].pinConfigured = true; await act(async () => button("Refresh").props.onClick());
  await act(async () => old()); expect(fixture.api.post).not.toHaveBeenCalled(); expect(text()).not.toContain("new-value");
});
