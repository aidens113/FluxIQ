import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import { AccountsAdmin, InviteForm, MemberActions, PendingInvites, ProofForm, type AccountsOutcome, type MemberRow, type MembersView } from "..";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function member(overrides: Partial<MemberRow>): MemberRow {
  return { userId: "u1", name: "Ana", email: "ana@example.test", role: "read-only", state: "active", source: "account", self: false, invitedAt: 0, lastSignInAt: null, ...overrides };
}

const VIEW: Pick<MembersView, "assignableRoles" | "canRemove"> = { assignableRoles: ["administrator", "read-only"], canRemove: true };
const done = async (): Promise<AccountsOutcome> => ({ kind: "done" });
const text = (renderer: ReactTestRenderer) => JSON.stringify(renderer.toJSON());
const buttonLabels = (renderer: ReactTestRenderer) => renderer.root.findAllByType("button").map((button) => String(button.props.children));

function render(element: ReturnType<typeof createElement>): ReactTestRenderer {
  let renderer!: ReactTestRenderer;
  act(() => { renderer = create(element); });
  return renderer;
}

describe("MemberActions", () => {
  it("offers role, turn off and remove for another active person", () => {
    const renderer = render(createElement(MemberActions, { member: member({}), view: VIEW, onApply: done, onDone: () => undefined }));
    expect(buttonLabels(renderer)).toEqual(["Change role", "Turn off", "Remove"]);
  });

  it("offers nothing for the viewer themselves, the owner, or an invite", () => {
    for (const row of [member({ self: true }), member({ role: "owner" }), member({ state: "invited" })]) {
      const renderer = render(createElement(MemberActions, { member: row, view: VIEW, onApply: done, onDone: () => undefined }));
      expect(renderer.root.findAllByType("button")).toHaveLength(0);
    }
  });

  it("offers turn on for someone turned off, and no remove for an older person or where removing is unavailable", () => {
    expect(buttonLabels(render(createElement(MemberActions, { member: member({ state: "turned-off" }), view: VIEW, onApply: done, onDone: () => undefined })))).toContain("Turn on");
    expect(buttonLabels(render(createElement(MemberActions, { member: member({ source: "identity" }), view: VIEW, onApply: done, onDone: () => undefined })))).not.toContain("Remove");
    expect(buttonLabels(render(createElement(MemberActions, { member: member({}), view: { ...VIEW, canRemove: false }, onApply: done, onDone: () => undefined })))).not.toContain("Remove");
  });

  it("confirms with the administrator's password before acting, and says plainly when the server refuses", async () => {
    const onApply = vi.fn(async (): Promise<AccountsOutcome> => ({ kind: "denied" }));
    const onDone = vi.fn();
    const renderer = render(createElement(MemberActions, { member: member({}), view: VIEW, onApply, onDone }));
    act(() => { renderer.root.findByProps({ children: "Turn off" }).props.onClick(); });
    expect(onApply).not.toHaveBeenCalled();
    expect(text(renderer)).toContain("Your password");
    const [password] = renderer.root.findAllByType("input");
    act(() => { password?.props.onChange({ target: { value: "dummy password" } }); });
    await act(async () => { await renderer.root.findByType("form").props.onSubmit({ preventDefault: () => undefined }); });
    expect(onApply).toHaveBeenCalledWith({ action: "turn-off", userId: "u1" }, { password: "dummy password" });
    expect(onDone).not.toHaveBeenCalled();
    expect(text(renderer)).toContain("You do not have access to do this.");
    // What was typed is cleared after the attempt and never shown back.
    expect(renderer.root.findAllByType("input")[0]?.props.value).toBe("");
    expect(text(renderer)).not.toContain("dummy password");
  });
});

describe("PendingInvites", () => {
  it("lists only invites, with resend and cancel, and never a link or token", () => {
    const rows = [member({ userId: "u2", name: "Ben", state: "invited" }), member({ userId: "u3", name: "Cy" })];
    const html = renderToStaticMarkup(createElement(PendingInvites, { members: rows, now: 10, onApply: done, onDone: () => undefined }));
    expect(html).toContain("Ben");
    expect(html).not.toContain("Cy");
    expect(html).toContain("Resend");
    expect(html).toContain("Cancel invite");
    expect(html).not.toMatch(/token|welcome#|https?:\/\//u);
  });

  it("says when none are waiting", () => {
    expect(renderToStaticMarkup(createElement(PendingInvites, { members: [member({})], now: 0, onApply: done, onDone: () => undefined }))).toContain("No invites are waiting.");
  });

  it("resends without asking for a password, and reports a refusal", async () => {
    const onApply = vi.fn(async (): Promise<AccountsOutcome> => ({ kind: "denied" }));
    const renderer = render(createElement(PendingInvites, { members: [member({ state: "invited" })], now: 0, onApply, onDone: () => undefined }));
    await act(async () => { await renderer.root.findByProps({ children: "Resend" }).props.onClick(); });
    expect(onApply).toHaveBeenCalledWith({ action: "resend-invite", userId: "u1" });
    expect(text(renderer)).toContain("You do not have access to do this.");
  });
});

describe("InviteForm", () => {
  it("checks the email and name, then confirms with the password, and says the invite went without showing a link", async () => {
    const onInvite = vi.fn(async (): Promise<AccountsOutcome> => ({ kind: "done" }));
    const renderer = render(createElement(InviteForm, { roles: ["administrator", "read-only"], onInvite, onDone: () => undefined }));
    await act(async () => { renderer.root.findByType("form").props.onSubmit({ preventDefault: () => undefined }); });
    expect(text(renderer)).toContain("Type the email address");
    const [email, name] = renderer.root.findAllByType("input");
    act(() => {
      email?.props.onChange({ target: { value: "new@example.test" } });
      name?.props.onChange({ target: { value: "New Person" } });
    });
    await act(async () => { renderer.root.findByType("form").props.onSubmit({ preventDefault: () => undefined }); });
    expect(onInvite).not.toHaveBeenCalled();
    expect(text(renderer)).toContain("as read only");
    const [password] = renderer.root.findAllByType("input");
    act(() => { password?.props.onChange({ target: { value: "dummy password" } }); });
    await act(async () => { await renderer.root.findByType("form").props.onSubmit({ preventDefault: () => undefined }); });
    expect(onInvite).toHaveBeenCalledWith({ email: "new@example.test", displayName: "New Person", role: "read-only" }, { password: "dummy password" });
    expect(text(renderer)).toContain("Invite sent to new@example.test");
    expect(text(renderer)).not.toMatch(/token|https?:\/\//u);
  });
});

describe("ProofForm", () => {
  it("asks again when the server wants the credentials re-proved", async () => {
    const renderer = render(createElement(ProofForm, { question: "Sure?", confirmLabel: "Go", onConfirm: async () => ({ kind: "needs-proof" as const, message: "That password, PIN or code was not accepted." }), onDone: () => undefined, onCancel: () => undefined }));
    await act(async () => { await renderer.root.findByType("form").props.onSubmit({ preventDefault: () => undefined }); });
    expect(text(renderer)).toContain("was not accepted");
  });
});

describe("AccountsAdmin", () => {
  it("shows the invite form and the waiting invites", () => {
    const view: MembersView = { workspaceKind: "single", assignableRoles: ["administrator", "read-only"], canRemove: true, members: [member({ state: "invited", name: "Ben" })] };
    const html = renderToStaticMarkup(createElement(AccountsAdmin, { view, now: 0, onInvite: done, onApply: done, onDone: () => undefined }));
    expect(html).toContain("Invite someone");
    expect(html).toContain("Ben");
  });
});
