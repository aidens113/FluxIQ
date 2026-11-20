import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { act, create } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import { PeopleList, PairedClientsList } from "../../access";
import { ActivitySection } from "../../activity";
import { ConfirmButton } from "../../confirm";
import type { ChangeResult } from "../../data";
import { SectionBody } from "../../state";
import { SecurityTabs } from "../SecurityTabs";
import { SECURITY_TABS } from "../security-tabs";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe("section states", () => {
  const body = (resource: any) => renderToStaticMarkup(createElement(SectionBody, { resource, noun: "your keys", children: () => createElement("p", null, "DATA") }));
  it("shows loading, error, no access and data", () => {
    expect(body({ state: "loading" })).toContain("Loading your keys");
    expect(body({ state: "error" })).toContain("Could not read your keys");
    const denied = body({ state: "ready", data: { state: "denied" } });
    expect(denied).toContain("You do not have access to this.");
    expect(denied).not.toContain("Could not read");
    expect(body({ state: "ready", data: { state: "ready", data: 1 } })).toContain("DATA");
  });
});

describe("access", () => {
  const access = { people: [{ id: "u1", name: "Ana", username: "ana", roleId: "admin", permissions: ["identity.manage"], enabled: true, sessions: [{ digest: "d1", expiresAt: 5 }] }], otherSessions: [] };
  it("lists people with roles, sessions and a place for the admin tools", () => {
    const html = renderToStaticMarkup(createElement(PeopleList, { access, onRevoke: async (): Promise<ChangeResult> => "done", onDone: () => undefined }));
    expect(html).toContain("Ana");
    expect(html).toContain("Administrator. Everything in the workspace, including people.");
    expect(html).not.toContain("identity.manage");
    expect(html).not.toContain("Can:");
    expect(html).toContain("End session");
    expect(html).toContain('data-slot="access-admin"');
    expect(html).not.toContain("d1");
  });
  it("shows each person's access controls and the admin tools only when given them", () => {
    const plain = renderToStaticMarkup(createElement(PeopleList, { access, onRevoke: async (): Promise<ChangeResult> => "done", onDone: () => undefined }));
    expect(plain).not.toContain("ACTIONS-u1");
    expect(plain).not.toContain("ADMIN-TOOLS");
    const managed = renderToStaticMarkup(createElement(PeopleList, {
      access,
      onRevoke: async (): Promise<ChangeResult> => "done",
      onDone: () => undefined,
      actions: (personId: string) => createElement("span", null, `ACTIONS-${personId}`),
      admin: createElement("p", null, "ADMIN-TOOLS")
    }));
    expect(managed).toContain("ACTIONS-u1");
    expect(managed).toMatch(/data-slot="access-admin"[^>]*><p>ADMIN-TOOLS<\/p>/u);
  });
  it("lists connected browsers one row each with Remove access, and folds removed ones under Removed (n)", () => {
    const rows = [
      { trustedClientId: "t1", name: "Chrome on Windows", clientType: "extension", status: "active", approvedAt: 1, lastUsedAt: 2 },
      { trustedClientId: "t2", name: "Old laptop", clientType: "extension", status: "revoked", approvedAt: 1, lastUsedAt: 2 }
    ];
    const html = renderToStaticMarkup(createElement(PairedClientsList, { rows, now: 10, onForget: async (): Promise<ChangeResult> => "done", onDone: () => undefined }));
    expect(html.match(/>Remove access</g)).toHaveLength(1);
    expect(html).toContain("Chrome on Windows · paired ");
    expect(html).toContain("last used");
    expect(html).toContain("<summary>Removed (1)</summary>");
    expect(html).toContain("Old laptop");
    expect(html).not.toMatch(/Windowsextension|extension ·/u);
  });
});

describe("activity", () => {
  it("starts by loading the log", () => {
    expect(renderToStaticMarkup(createElement(ActivitySection))).toContain("Loading activity");
  });
});

describe("ConfirmButton", () => {
  const texts = (renderer: ReturnType<typeof create>) => JSON.stringify(renderer.toJSON());
  it("asks first, acts only on confirm, and reports done", async () => {
    const onConfirm = vi.fn(async () => "done" as const);
    const onDone = vi.fn();
    let renderer!: ReturnType<typeof create>;
    act(() => { renderer = create(createElement(ConfirmButton, { label: "Forget", question: "Sure?", confirmLabel: "Yes, forget", onConfirm, onDone })); });
    act(() => { renderer.root.findByProps({ children: "Forget" }).props.onClick(); });
    expect(onConfirm).not.toHaveBeenCalled();
    expect(texts(renderer)).toContain("Sure?");
    await act(async () => { renderer.root.findByProps({ children: "Yes, forget" }).props.onClick(); });
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalledTimes(1);
  });
  it("cancel does nothing, and a refusal reads as no access", async () => {
    const onConfirm = vi.fn(async () => "denied" as const);
    let renderer!: ReturnType<typeof create>;
    act(() => { renderer = create(createElement(ConfirmButton, { label: "Forget", question: "Sure?", confirmLabel: "Yes", onConfirm, onDone: () => undefined })); });
    act(() => { renderer.root.findByProps({ children: "Forget" }).props.onClick(); });
    act(() => { renderer.root.findByProps({ children: "Cancel" }).props.onClick(); });
    expect(onConfirm).not.toHaveBeenCalled();
    act(() => { renderer.root.findByProps({ children: "Forget" }).props.onClick(); });
    await act(async () => { renderer.root.findByProps({ children: "Yes" }).props.onClick(); });
    expect(texts(renderer)).toContain("You do not have access to do this.");
  });
});

describe("the tab bar", () => {
  it("lists the four tabs in order, links each, and marks only the current one", () => {
    const html = renderToStaticMarkup(createElement(SecurityTabs, { active: "devices" }));
    expect(SECURITY_TABS.map((tab) => tab.label)).toEqual(["Your sign-in", "Devices and apps", "People", "Activity"]);
    expect(html.indexOf("Your sign-in")).toBeLessThan(html.indexOf("Devices and apps"));
    expect(html.indexOf("Devices and apps")).toBeLessThan(html.indexOf("People"));
    expect(html.indexOf("People")).toBeLessThan(html.indexOf("Activity"));
    for (const href of ["/security/sign-in", "/security/devices", "/security/people", "/security/activity"]) expect(html).toContain(`href="${href}"`);
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
    expect(html).toMatch(/aria-current="page"[^>]*>Devices and apps</u);
    expect(html).not.toMatch(/Keys/u);
  });
});
