import { describe, expect, it } from "vitest";
import { IdentitySessionRevocations } from "../session-revocations.ts";

// The raw ids a revoke announces: the one presented, plus each remembered for a
// revoked digest; expired ones are forgotten. Each listener is told who
// revoked it; a revoke nobody vouches for is announced to no one. Ids here are
// dummy values.

const OWNER = { userId: "user.one", administrator: false } as const;

describe("IdentitySessionRevocations", () => {
  it("announces the presented id and each remembered id once, then forgets them", async () => {
    const told: string[] = [];
    const revocations = new IdentitySessionRevocations([(sessionId) => { told.push(sessionId); }]);
    revocations.remember("digest.one", "session.one", 2_000, 1_000);
    revocations.remember("digest.two", "session.two", 2_000, 1_000);
    await revocations.revoked(["digest.one", "digest.two", "digest.unknown"], OWNER, "session.one");
    expect(told).toEqual(["session.one", "session.two"]);
    await revocations.revoked(["digest.one"], OWNER);
    expect(told).toEqual(["session.one", "session.two"]);
  });

  it("forgets an expired session's id instead of announcing it", async () => {
    const told: string[] = [];
    const revocations = new IdentitySessionRevocations();
    revocations.subscribe((sessionId) => { told.push(sessionId); });
    revocations.remember("digest.old", "session.old", 1_500, 1_000);
    revocations.remember("digest.new", "session.new", 5_000, 2_000);
    await revocations.revoked(["digest.old", "digest.new"], OWNER);
    expect(told).toEqual(["session.new"]);
  });

  it("stops telling a listener once unsubscribed", async () => {
    const told: string[] = [];
    const revocations = new IdentitySessionRevocations();
    const unsubscribe = revocations.subscribe((sessionId) => { told.push(sessionId); });
    unsubscribe();
    await revocations.revoked([], OWNER, "session.one");
    expect(told).toEqual([]);
  });

  it("runs every listener before reporting the ones that failed", async () => {
    const told: string[] = [];
    const revocations = new IdentitySessionRevocations([async () => { throw new Error("listener down"); }, (sessionId) => { told.push(sessionId); }]);
    const failure = await revocations.revoked([], OWNER, "session.one").catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(AggregateError);
    expect((failure as AggregateError).errors).toHaveLength(1);
    expect((failure as Error).message).not.toContain("session.one");
    expect(told).toEqual(["session.one"]);
  });
});

describe("IdentitySessionRevocations revoker", () => {
  it("tells each listener who revoked the session", async () => {
    const told: Array<[string, { userId: string | null; administrator: boolean }]> = [];
    const revocations = new IdentitySessionRevocations([(sessionId, revoker) => { told.push([sessionId, revoker]); }]);
    await revocations.revoked([], { userId: "admin", administrator: true }, "session.one");
    expect(told).toEqual([["session.one", { userId: "admin", administrator: true }]]);
  });

  it("announces a revoke nobody vouches for to no one, and still forgets its ids", async () => {
    const told: string[] = [];
    const revocations = new IdentitySessionRevocations([(sessionId) => { told.push(sessionId); }]);
    revocations.remember("digest.one", "session.one", 2_000, 1_000);
    await revocations.revoked(["digest.one"], { userId: null, administrator: false }, "session.presented");
    await revocations.revoked(["digest.one"], OWNER);
    expect(told).toEqual([]);
  });
});
