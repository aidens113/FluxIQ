import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
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
