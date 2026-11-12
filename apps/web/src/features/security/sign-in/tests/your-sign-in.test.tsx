import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IdentityAccessLive } from "../IdentityAccessLive";

// The signed-in person's own password, PIN and two-factor, reached without
// finding themselves in the people list.
const fixture = vi.hoisted(() => ({ api: { get: vi.fn(), post: vi.fn() } }));
vi.mock("../../../programs/program-api", () => ({ useProgramApi: () => fixture.api }));
vi.mock("../../../programs/shared-ui", async (original) => ({
  ...await original<object>(),
  Modal: (props: any) => <section data-modal={props.title} data-description={props.description}>{props.children}</section>
}));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const actor = { id: "actor", displayName: "Actor", roleId: "viewer", totpEnabled: false, pinConfigured: false };
const user = (id: string, extra: object = {}) => ({ id, username: id, displayName: id, roleId: "viewer", enabled: true, totpEnabled: false, passwordConfigured: true, authorityHeldElsewhere: false, createdAtMs: 1, updatedAtMs: 2, ...extra });
const session = (id: string, userId: string) => ({ id, userId, expiresAtMs: 10 });
let renderer: ReactTestRenderer | undefined;
let payload: any;
const label = (node: any): string => node.children.map((child: any) => typeof child === "string" ? child : label(child)).join("");
const text = () => JSON.stringify(renderer!.toJSON());
const button = (name: string) => renderer!.root.findAllByType("button").find((node) => label(node) === name);
const mount = async () => {
  await act(async () => {
    renderer = create(<IdentityAccessLive currentUser={actor} />);
  });
};

beforeEach(() => {
  payload = { users: [user("actor", { pinConfigured: true }), user("other", { totpEnabled: true })], roles: [{ id: "viewer", permissions: [] }], sessions: [session("s1", "actor"), session("s2", "actor"), session("s3", "other")], vault: { initialized: true, unlocked: true } };
  fixture.api = { get: vi.fn(async () => ({ ok: true, payload })), post: vi.fn(async () => ({ ok: true })) };
});
afterEach(() => {
  if (renderer) act(() => renderer!.unmount());
  renderer = undefined;
});

it("shows the person's own factors, sessions and the vault", async () => {
  await mount();
  const panel = renderer!.root.findAll((node) => node.props.title === "Your sign-in")[0]!;
  const rows = JSON.stringify(panel.findAll((node) => Array.isArray(node.props.rows))[0]!.props.rows);
  expect(rows).toContain('["PIN","Configured"]');
  expect(rows).toContain('["Two-factor","Off"]');
  expect(rows).toContain('["Your active sessions","2"]');
  expect(rows).toContain('["Credential vault","Unlocked"]');
  expect(button("Change your PIN")).toBeDefined();
  expect(button("Set up two-factor")).toBeDefined();
});

it("changes the person's own password through the same authorized dialog", async () => {
  await mount();
  act(() => button("Change your password")!.props.onClick());
  expect(text()).toContain("Change password");
  expect(text()).toContain("Replace actor's password");
  expect(text()).not.toContain("Replace other's password");
});

it("starts two-factor enrolment for the person, not whoever is selected", async () => {
  await mount();
  act(() => button("Set up two-factor")!.props.onClick());
  expect(text()).toContain("Authorize enrollment for actor");
});

it("says so plainly when the person's own account cannot be read", async () => {
  payload = { ...payload, users: [user("other")] };
  await mount();
  expect(text()).toContain("Your own account is not in the identity list");
  expect(button("Change your password")).toBeUndefined();
});

describe("the capitals of the person's own sign-in name", () => {
  const modal = () => renderer!.root.findAll((node) => node.props["data-modal"] === "Capitals in your sign-in name")[0];
  const nameInput = () => modal()!.findAllByType("input")[0]!;
  const save = () => button("Save sign-in name")!;
  const type = (value: string) => act(() => nameInput().props.onChange({ target: { value } }));
  const open = async () => {
    payload = { ...payload, users: [user("actor", { username: "actor@example.test" }), user("other")] };
    await mount();
    act(() => button("Change capitals in your sign-in name")!.props.onClick());
  };

  it("shows the name, and explains that only its capitals can change", async () => {
    await open();
    const panel = renderer!.root.findAll((node) => node.props.title === "Your sign-in")[0]!;
    expect(JSON.stringify(panel.findAll((node) => Array.isArray(node.props.rows))[0]!.props.rows)).toContain('["Sign-in name","actor@example.test"]');
    expect(modal()!.props["data-description"]).toContain("Only which letters are capitals can change here");
    expect(nameInput().props.value).toBe("actor@example.test");
    expect(save().props.disabled).toBe(true);
  });

  it("saves the name in other capitals through the person's own endpoint, then closes and reloads", async () => {
    await open();
    type("Actor@Example.Test");
    expect(save().props.disabled).toBe(false);
    const reads = fixture.api.get.mock.calls.length;
    await act(async () => save().props.onClick());
    expect(fixture.api.post).toHaveBeenCalledTimes(1);
    expect(fixture.api.post).toHaveBeenCalledWith("recase-my-username", { username: "Actor@Example.Test" });
    expect(fixture.api.post.mock.calls.some((call: unknown[]) => call[0] === "update-user")).toBe(false);
    expect(modal()).toBeUndefined();
    expect(fixture.api.get.mock.calls.length).toBeGreaterThan(reads);
    expect(text()).toContain("Sign-in name updated");
  });

  it("never sends a different name, and says why", async () => {
    await open();
    type("someone@example.test");
    expect(save().props.disabled).toBe(true);
    expect(text()).toContain("That is a different name. Only the capitals of actor@example.test can change here.");
    await act(async () => save().props.onClick());
    expect(fixture.api.post).not.toHaveBeenCalled();
  });

  it("shows a refusal plainly and keeps the dialog open", async () => {
    fixture.api.post = vi.fn(async () => ({ ok: false, error: "Another person already has this sign-in name (sign-in names are compared ignoring case)", errorCode: "identity.username_taken" }));
    await open();
    type("ACTOR@example.test");
    await act(async () => save().props.onClick());
    expect(modal()).toBeDefined();
    expect(text()).toContain("Your sign-in name was not changed");
    expect(text()).toContain("Another person already has this sign-in name (sign-in names are compared ignoring case)");
    // Typing again clears it.
    type("ACTOR@Example.test");
    expect(text()).not.toContain("Another person already has this sign-in name");
  });

  it("says plainly when the call itself fails", async () => {
    fixture.api.post = vi.fn(async () => { throw new Error("network down"); });
    await open();
    type("Actor@example.test");
    await act(async () => save().props.onClick());
    expect(text()).toContain("The identity operation could not be completed. Try again.");
    expect(text()).not.toContain("network down");
  });

  it("lets a member re-case only their authenticated name when the identity snapshot is refused", async () => {
    const member = { ...actor, username: "member@example.test" };
    fixture.api.get = vi.fn(async () => ({ ok: false, errorCode: "authorization.forbidden" }));
    await act(async () => { renderer = create(<IdentityAccessLive currentUser={member} />); });

    expect(button("Change capitals in your sign-in name")).toBeDefined();
    expect(button("Add User")).toBeUndefined();
    act(() => button("Change capitals in your sign-in name")!.props.onClick());
    expect(nameInput().props.value).toBe(member.username);
    type("Member@Example.Test");
    await act(async () => save().props.onClick());

    expect(fixture.api.post).toHaveBeenCalledWith("recase-my-username", { username: "Member@Example.Test" });
    expect(fixture.api.post).toHaveBeenCalledTimes(1);
    expect(text()).toContain("Member@Example.Test");
    expect(modal()).toBeUndefined();
  });

  it("keeps the person's draft when the broader identity read finishes with a refusal", async () => {
    let refuse!: (answer: { ok: false; errorCode: string }) => void;
    fixture.api.get = vi.fn(() => new Promise((resolve) => { refuse = resolve; }));
    const member = { ...actor, username: "member@example.test" };
    await act(async () => { renderer = create(<IdentityAccessLive currentUser={member} />); });
    act(() => button("Change capitals in your sign-in name")!.props.onClick());
    type("Member@Example.Test");

    await act(async () => refuse({ ok: false, errorCode: "authorization.forbidden" }));

    expect(nameInput().props.value).toBe("Member@Example.Test");
    expect(save().props.disabled).toBe(false);
    expect(fixture.api.post).not.toHaveBeenCalled();
  });
});
