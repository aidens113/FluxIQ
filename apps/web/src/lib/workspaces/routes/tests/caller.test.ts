import { describe, expect, it, vi } from "vitest";
import type { workspaceProgramContext } from "../../program-context";
import { readWorkspaceRouteCaller } from "../caller";

vi.mock("../../../fluxiq", () => ({ getFluxIQWorkspaces: () => { throw new Error("A held request must never select ambient identity"); } }));

type Selected = NonNullable<Awaited<ReturnType<typeof workspaceProgramContext>>>;

function selection(separateIdentity: boolean) {
  const identity = { validateSession: vi.fn(async () => ({ user: { id: "person-a" }, role: { id: "operator", permissions: ["programs.read"] } })) };
  const foreign = { validateSession: vi.fn(() => { throw new Error("Tenant-local identity must not replace platform identity"); }) };
  const selected = {
    workspaceId: "tenant-a", sessionId: "cookie-a", authorization: null,
    context: { fluxiq: { programs: { identityAccess: separateIdentity ? foreign : identity } }, ...(separateIdentity ? { identityAuthority: identity } : {}) },
    acceptBearer: false, current: () => true, release: vi.fn()
  } as unknown as Selected;
  return { selected, identity, foreign };
}

describe("pinned request identity", () => {
  it.each([true, false])("uses only its selected identity during concurrent caller reads (separate=%s)", async separateIdentity => {
    const h = selection(separateIdentity);
    const input = { selected: h.selected, channel: "panel" as const, sessionId: "cookie-a", token: null, url: "https://panel.example.test/api/security/audit" };
    const results = await Promise.all([readWorkspaceRouteCaller(input), readWorkspaceRouteCaller(input)]);
    for (const result of results) expect(result).toMatchObject({ ok: true, caller: { actor: { userId: "person-a" }, binding: { workspaceId: "tenant-a" } } });
    expect(h.identity.validateSession).toHaveBeenCalledTimes(2);
    expect(h.foreign.validateSession).not.toHaveBeenCalled();
  });
});
