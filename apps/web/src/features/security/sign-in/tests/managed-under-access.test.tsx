import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { IdentityAccessLive } from "../IdentityAccessLive";

// A person with an account (`authorityHeldElsewhere`) has their sign-in name,
// role and sign-in on/off set by provisioning, and `update-user` refuses all
// three, so the page offers none of them and says "Managed under Access" with a
// link to the Access section. A person without an account keeps every control.
const fixture = vi.hoisted(() => ({ api: { get: vi.fn(), post: vi.fn() } }));
vi.mock("../../../programs/program-api", () => ({ useProgramApi: () => fixture.api }));
vi.mock("../../../programs/shared-ui", async (original) => ({ ...await original<object>(),
  Modal: (props: any) => <section data-modal={props.title}>{props.children}</section>,
  Menu: (props: any) => <div data-menu={props.label}>{props.options.map((option: any) => <button disabled={option.disabled} key={option.id} onClick={option.onSelect}>{option.label}</button>)}</div>
}));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const actor = { id: "actor", displayName: "Actor", roleId: "admin", totpEnabled: false, pinConfigured: false };
const user = (id: string, roleId: string, authorityHeldElsewhere: boolean) => ({ id, username: id + "@example.test", displayName: id, roleId, enabled: true, totpEnabled: false, authorityHeldElsewhere, createdAtMs: 1, updatedAtMs: 2 });
let renderer: ReactTestRenderer | undefined, payload: any;
const label = (node: any): string => node.children.map((child: any) => typeof child === "string" ? child : label(child)).join("");
const text = () => JSON.stringify(renderer!.toJSON());
const button = (name: string) => renderer!.root.findAllByType("button").find((node) => label(node) === name);
const menu = (id: string) => renderer!.root.findByProps({ "data-menu": "Actions for " + id }).findAllByType("button").map((node) => label(node));
const action = (id: string, name: string) => renderer!.root.findByProps({ "data-menu": "Actions for " + id }).findAllByType("button").find((node) => label(node) === name)!;
const row = (id: string) => renderer!.root.findAllByType("button").find((node) => node.props.className === "identity-user-link" && label(node).startsWith(id + "@"))!;
const accessLinks = () => renderer!.root.findAllByType("a").filter((node) => label(node) === "Managed under Access");
const mount = async () => { await act(async () => { renderer = create(<IdentityAccessLive currentUser={actor} />); }); };

beforeEach(() => {
  payload = { users: [user("actor", "admin", false), user("holder", "viewer", true), user("local", "viewer", false)], roles: [{ id: "admin", permissions: [] }, { id: "viewer", permissions: [] }], sessions: [], vault: { initialized: true, unlocked: false } };
  fixture.api = { get: vi.fn(async () => ({ ok: true, payload })), post: vi.fn(async () => ({ ok: true })) };
});
afterEach(() => {
  if (renderer) act(() => renderer!.unmount());
  renderer = undefined;
});

it("offers no role or sign-in on/off for a managed person, and links to Access in their place", async () => {
  await mount();

  expect(menu("holder")).not.toContain("Change role");
  expect(menu("holder")).not.toContain("Disable user");
  expect(menu("holder")).toEqual(expect.arrayContaining(["Edit profile", "Change password", "Change PIN", "Set up 2FA"]));
  expect(accessLinks()).toHaveLength(1);
  expect(accessLinks()[0]!.props.href).toBe("/security#security-access");
});

it("keeps every control for a person without an account", async () => {
  await mount();

  expect(menu("local")).toEqual(expect.arrayContaining(["Edit profile", "Change role", "Disable user"]));
  act(() => row("local").props.onClick());
  expect(text()).not.toContain("This person has an account");
});

it("says in the person's detail that their sign-in name, role and sign-in are managed under Access", async () => {
  await mount();

  act(() => row("holder").props.onClick());

  expect(text()).toContain("This person has an account: their sign-in name, role and whether they can sign in are ");
  expect(accessLinks()).toHaveLength(2);
});

it("edits only a managed person's display name, showing their sign-in name read-only", async () => {
  await mount();
  act(() => action("holder", "Edit profile").props.onClick());
  const dialog = renderer!.root.findByProps({ "data-modal": "Edit User Profile" });
  const [displayName, username] = dialog.findAllByType("input");

  expect(username!.props.readOnly).toBe(true);
  expect(username!.props.value).toBe("holder@example.test");
  act(() => displayName!.props.onChange({ target: { value: "Renamed Holder" } }));
  await act(async () => button("Save Profile")!.props.onClick());

  expect(fixture.api.post).toHaveBeenLastCalledWith("update-user", { id: "holder", displayName: "Renamed Holder" });
});

it("still sends the sign-in name for a person without an account", async () => {
  await mount();
  act(() => action("local", "Edit profile").props.onClick());
  const [, username] = renderer!.root.findByProps({ "data-modal": "Edit User Profile" }).findAllByType("input");

  expect(username!.props.readOnly).toBeUndefined();
  act(() => username!.props.onChange({ target: { value: "renamed-local" } }));
  await act(async () => button("Save Profile")!.props.onClick());

  expect(fixture.api.post).toHaveBeenLastCalledWith("update-user", { id: "local", username: "renamed-local", displayName: "local" });
});

it.each([["Change role", "Change Role", "Save Role"], ["Disable user", "Disable User", "Disable User"]])("closes an open %s dialog when a refresh shows the person is managed, and its retained submit sends nothing", async (entry, title, submitLabel) => {
  await mount();
  act(() => action("local", entry).props.onClick());
  const dialog = renderer!.root.findByProps({ "data-modal": title });
  act(() => dialog.findAllByType("input").find((node) => node.props.type === "password")!.props.onChange({ target: { value: "synthetic-auth" } }));
  const submit = dialog.findAllByType("button").find((node) => label(node) === submitLabel)!.props.onClick;

  payload = { ...payload, users: payload.users.map((item: any) => item.id === "local" ? { ...item, authorityHeldElsewhere: true } : item) };
  await act(async () => button("Refresh")!.props.onClick());
  await act(async () => submit());

  expect(renderer!.root.findAll((node) => node.props["data-modal"] === title)).toHaveLength(0);
  expect(fixture.api.post).not.toHaveBeenCalled();
  expect(menu("local")).not.toContain(entry);
});

it("refuses a snapshot that does not say who is managed, rather than offering their controls", async () => {
  payload = { ...payload, users: payload.users.map(({ authorityHeldElsewhere: _omitted, ...rest }: any) => rest) };

  await mount();

  expect(text()).toContain("Identity metadata could not be loaded.");
  expect(renderer!.root.findAll((node) => node.props["data-menu"] !== undefined)).toHaveLength(0);
});
