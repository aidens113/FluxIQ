import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProgramCommandTransport } from "../../../automation-studio/data/program-transport";
import { applyMemberChange, loadMembers, outcomeOfAnswer, sendInvite } from "..";

afterEach(() => vi.unstubAllGlobals());

function stubFetch(status: number, body: unknown) {
  const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function identity(answer: Record<string, unknown>) {
  const post = vi.fn(async () => answer);
  return { port: { get: vi.fn(), post } as unknown as ProgramCommandTransport, post };
}

describe("outcomeOfAnswer", () => {
  it("tells done, no access, re-prove, a reason and a failure apart", () => {
    expect(outcomeOfAnswer(200, { ok: true })).toEqual({ kind: "done" });
    expect(outcomeOfAnswer(403, { ok: false, code: "forbidden", error: "x" })).toEqual({ kind: "denied" });
    expect(outcomeOfAnswer(403, { ok: false, error: "Permission required: identity.manage" })).toEqual({ kind: "denied" });
    expect(outcomeOfAnswer(403, { ok: false, code: "recheck", error: "Type your password.", requiresRecheck: true })).toEqual({ kind: "needs-proof", message: "Type your password." });
    expect(outcomeOfAnswer(409, { ok: false, code: "last_administrator", error: "Make someone else an administrator first." })).toEqual({ kind: "refused", message: "Make someone else an administrator first." });
    expect(outcomeOfAnswer(429, { ok: false, code: "rate_limited", error: "Wait a while before sending it again." })).toEqual({ kind: "refused", message: "Wait a while before sending it again." });
    expect(outcomeOfAnswer(500, { ok: false, code: "failed", error: "x" })).toEqual({ kind: "failed" });
    expect(outcomeOfAnswer(502, undefined)).toEqual({ kind: "failed" });
  });
});

describe("loadMembers", () => {
  it("is denied on 401 and 403, so the tools stay hidden, and throws on any other failure", async () => {
    stubFetch(403, { ok: false });
    expect(await loadMembers(new AbortController().signal)).toEqual({ state: "denied" });
    stubFetch(401, { ok: false });
    expect(await loadMembers(new AbortController().signal)).toEqual({ state: "denied" });
    stubFetch(500, { ok: false });
    await expect(loadMembers(new AbortController().signal)).rejects.toThrow();
  });
});

describe("sendInvite and applyMemberChange", () => {
  it("posts an invite with the proof to the invite route only", async () => {
    const fetchMock = stubFetch(200, { ok: true, payload: { userId: "u9" } });
    expect(await sendInvite({ email: "a@example.test", displayName: "A", role: "read-only" }, { password: "dummy" })).toEqual({ kind: "done" });
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/accounts/invite");
  });

  it("changes an account through the accounts route", async () => {
    const fetchMock = stubFetch(403, { ok: false, code: "forbidden", error: "You do not have access to do this." });
    const { port, post } = identity({ ok: true });
    expect(await applyMemberChange("account", { action: "turn-off", userId: "u1" }, { password: "dummy" }, port)).toEqual({ kind: "denied" });
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/accounts/member");
    expect(post).not.toHaveBeenCalled();
  });

  it("changes an older person through Identity Access's update-user, with the proof as its re-check", async () => {
    stubFetch(500, {});
    const { port, post } = identity({ ok: true });
    expect(await applyMemberChange("identity", { action: "set-role", userId: "u1", role: "administrator" }, { password: "dummy", pin: "1234" }, port)).toEqual({ kind: "done" });
    expect(post).toHaveBeenCalledWith("update-user", { id: "u1", roleId: "admin", authorizationPassword: "dummy", authorizationPin: "1234" });
    const refused = identity({ ok: false, requiresRecheck: true, error: "Invalid credentials" });
    expect((await applyMemberChange("identity", { action: "turn-off", userId: "u1" }, { password: "wrong" }, refused.port)).kind).toBe("needs-proof");
    expect(await applyMemberChange("identity", { action: "remove", userId: "u1" }, { password: "dummy" }, port)).toMatchObject({ kind: "refused" });
  });
});
