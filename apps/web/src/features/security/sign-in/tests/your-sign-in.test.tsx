import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { YourSignIn } from "../YourSignIn";
import { SignOutButton } from "../SignOutButton";

// The signed-in person's own sign-in, in plain words: name, Change password,
// two-step sign-in and Sign out, with no PIN and no vault row.
const fixture = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock("../../../programs/program-api", () => ({ useProgramApi: () => ({ get: vi.fn(), post: (...args: unknown[]) => fixture.post(...args) }) }));
vi.mock("../../../programs/shared-ui", async (original) => ({
  ...await original<object>(),
  Modal: (props: any) => <section data-modal={props.title} data-description={props.description}>{props.children}</section>
}));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const person = { id: "actor", displayName: "Ada", username: "ada@example.test", roleId: "viewer", totpEnabled: false, pinConfigured: false };
let renderer: ReactTestRenderer | undefined;
const label = (node: any): string => node.children.map((child: any) => typeof child === "string" ? child : label(child)).join("");
const text = () => JSON.stringify(renderer!.toJSON());
const button = (name: string) => renderer!.root.findAllByType("button").find((node) => label(node) === name);
const modal = (title: string) => renderer!.root.findAll((node) => node.props["data-modal"] === title)[0];
const type = (title: string, field: string, value: string) => {
  const input = modal(title)!.findAll((node) => node.type === "label" && label(node).startsWith(field))[0]!.findByType("input");
  act(() => input.props.onChange({ target: { value } }));
};
const submit = async (title: string) => { await act(async () => { await modal(title)!.findByType("form").props.onSubmit({ preventDefault: () => undefined }); }); };
const mount = async (user = person) => { await act(async () => { renderer = create(<YourSignIn user={user} />); }); };

beforeEach(() => { fixture.post = vi.fn(async () => ({ ok: true })); });
afterEach(() => {
  if (renderer) act(() => renderer!.unmount());
  renderer = undefined;
});

describe("Your sign-in", () => {
  it("shows the name, two-step sign-in in plain words, and Sign out, with no PIN and no vault", async () => {
    await mount();
    expect(text()).toContain("Ada");
    expect(text()).toContain("ada@example.test");
    expect(text()).toContain("Ask for a code from an authenticator app when you sign in");
    expect(button("Sign out")).toBeDefined();
    expect(button("Change password")).toBeDefined();
    expect(text()).not.toMatch(/\bPIN\b|vault|Locked|Unlocked|factor/iu);
    expect(renderer!.root.findByType("a" as any).props.href).toBe("/security/advanced");
  });

  it("changes the password through labelled fields and says Password changed.", async () => {
    await mount();
    act(() => button("Change password")!.props.onClick());
    const labels = modal("Change password")!.findAll((node) => node.type === "label").map(label);
    expect(labels).toEqual(["Current password", "New password", "Repeat new password"]);
    type("Change password", "Current password", "old-one");
    type("Change password", "New password", "new-one");
    type("Change password", "Repeat new password", "new-one");
    await submit("Change password");
    expect(fixture.post).toHaveBeenCalledWith("set-password", { userId: "actor", value: "new-one", authorizationPassword: "old-one", authorizationPin: "", authorizationTotp: "" });
    expect(modal("Change password")).toBeUndefined();
    expect(text()).toContain("Password changed.");
  });

  it("says inline that the new passwords do not match, and sends nothing", async () => {
    await mount();
    act(() => button("Change password")!.props.onClick());
    type("Change password", "Current password", "old-one");
    type("Change password", "New password", "new-one");
    type("Change password", "Repeat new password", "other-one");
    expect(text()).toContain("The new passwords do not match.");
    const save = modal("Change password")!.findAllByType("button").find((node) => label(node) === "Change password")!;
    expect(save.props.disabled).toBe(true);
    await submit("Change password");
    expect(fixture.post).not.toHaveBeenCalled();
    expect(modal("Change password")).toBeDefined();
  });

  it("keeps the dialog open and shows the refusal in words when the server says no", async () => {
    fixture.post = vi.fn(async () => ({ ok: false, error: "That password is not right." }));
    await mount();
    act(() => button("Change password")!.props.onClick());
    type("Change password", "Current password", "bad");
    type("Change password", "New password", "new-one");
    type("Change password", "Repeat new password", "new-one");
    await submit("Change password");
    expect(modal("Change password")).toBeDefined();
    expect(text()).toContain("That password is not right.");
    expect(text()).not.toContain("Password changed.");
  });

  it("asks for the authenticator code only when two-step sign-in is on", async () => {
    await mount({ ...person, totpEnabled: true });
    expect(text()).toContain("Turn off two-step sign-in");
    act(() => button("Change password")!.props.onClick());
    expect(modal("Change password")!.findAll((node) => node.type === "label").map(label)).toContain("Code from your authenticator app");
  });

  it("starts two-step setup for the person with their password", async () => {
    await mount();
    act(() => button("Set up two-step sign-in")!.props.onClick());
    type("Set up two-step sign-in", "Your password", "pw");
    fixture.post = vi.fn(async () => ({ ok: true, payload: { secret: "ABCD", qrSvg: "<svg></svg>", otpauthUrl: "otpauth://x", issuer: "FluxIQ", accountLabel: "ada" } }));
    await submit("Set up two-step sign-in");
    expect(fixture.post).toHaveBeenCalledWith("begin-totp", { userId: "actor", authorizationPassword: "pw", authorizationPin: "", authorizationTotp: "" });
    expect(text()).toContain("ABCD");
  });

  it("changes the capitals of the sign-in name through the own-name endpoint", async () => {
    await mount();
    act(() => button("Change capitals in your sign-in name")!.props.onClick());
    const input = modal("Capitals in your sign-in name")!.findAllByType("input")[0]!;
    act(() => input.props.onChange({ target: { value: "Ada@Example.Test" } }));
    await act(async () => button("Save sign-in name")!.props.onClick());
    expect(fixture.post).toHaveBeenCalledWith("recase-my-username", { username: "Ada@Example.Test" });
    expect(text()).toContain("Sign-in name updated.");
  });
});

describe("Sign out", () => {
  it("runs the sign-out and says so when it failed", async () => {
    const signOutAction = vi.fn(async () => false);
    await act(async () => { renderer = create(<SignOutButton signOutAction={signOutAction} />); });
    await act(async () => button("Sign out")!.props.onClick());
    expect(signOutAction).toHaveBeenCalledTimes(1);
    expect(text()).toContain("Could not sign out. Try again.");
  });

  it("does not report a failure when the session ended", async () => {
    const signOutAction = vi.fn(async () => true);
    await act(async () => { renderer = create(<SignOutButton signOutAction={signOutAction} />); });
    await act(async () => button("Sign out")!.props.onClick());
    expect(text()).not.toContain("Could not sign out");
  });
});
