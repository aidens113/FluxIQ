import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const snapshot = {
  users: [
    { id: "u-admin", username: "admin@example.test", displayName: "Ada", roleId: "admin", enabled: true },
    { id: "u-ben", username: "ben@example.test", displayName: "Ben", roleId: "viewer", enabled: true }
  ],
  roles: [{ id: "admin", permissions: ["identity.manage"] }, { id: "viewer", permissions: ["programs.read"] }],
  sessions: []
};

vi.mock("../../../automation-studio/data/use-program-transport", () => {
  const transport = { get: async () => ({ ok: true, status: 200, payload: snapshot }), post: async () => ({ ok: true, status: 200 }) };
  return { useProgramTransport: () => transport };
});

import { AccessSection } from "../AccessSection";

const MEMBERS = {
  ok: true,
  payload: {
    workspaceKind: "single",
    assignableRoles: ["administrator", "read-only"],
    canRemove: true,
    members: [
      { userId: "u-admin", name: "Ada", email: "admin@example.test", role: "administrator", state: "active", source: "account", self: true, invitedAt: 1, lastSignInAt: 2 },
      { userId: "u-ben", name: "Ben", email: "ben@example.test", role: "read-only", state: "active", source: "account", self: false, invitedAt: 1, lastSignInAt: 2 }
    ]
  }
};

function stubFetch(members: { status: number; body: unknown }) {
  const calls: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    calls.push(url);
    const answer = url === "/api/accounts/members" ? members : { status: 200, body: { ok: true, payload: { trustedClients: [] } } };
    return new Response(JSON.stringify(answer.body), { status: answer.status, headers: { "content-type": "application/json" } });
  }));
  return calls;
}

async function render(): Promise<ReactTestRenderer> {
  let renderer!: ReactTestRenderer;
  await act(async () => { renderer = create(createElement(AccessSection)); });
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  return renderer;
}

const labels = (renderer: ReactTestRenderer) => renderer.root.findAllByType("button").map((button) => String(button.props.children));

afterEach(() => vi.unstubAllGlobals());

describe("AccessSection", () => {
  it("gives an administrator each other person's controls and the invite tools, and none on their own row", async () => {
    stubFetch({ status: 200, body: MEMBERS });
    const renderer = await render();
    const text = JSON.stringify(renderer.toJSON());
    expect(text).toContain("Invite someone");
    expect(labels(renderer)).toEqual(expect.arrayContaining(["Change role", "Turn off", "Remove", "Invite"]));
    expect(labels(renderer).filter((label) => label === "Turn off")).toHaveLength(1);
    expect(text).toContain("Your own access is changed by another administrator.");
  });

  it("shows a person refused by the server no admin tools, and does not ask again on the next refresh", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const calls = stubFetch({ status: 403, body: { ok: false, code: "forbidden", error: "Permission required: identity.manage" } });
    const renderer = await render();
    await act(async () => {
      vi.advanceTimersByTime(30_000);
      await Promise.resolve();
    });
    vi.useRealTimers();
    const text = JSON.stringify(renderer.toJSON());
    expect(text).toContain("Ada");
    expect(text).not.toContain("Invite someone");
    expect(labels(renderer)).not.toContain("Turn off");
    expect(labels(renderer)).not.toContain("Change role");
    expect(calls.filter((url) => url === "/api/accounts/members")).toHaveLength(1);
    // The refresh did run: the paired browsers were read again.
    expect(calls.filter((url) => url === "/api/client-gateway/snapshot").length).toBeGreaterThan(1);
  });
});
