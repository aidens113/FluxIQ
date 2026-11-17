import { describe, expect, it } from "vitest";
import { automationStudioResultCheckGrantForRequest, automationStudioResultCheckGrantorOf, withStoredCheckAuthorization } from "../index.ts";

// A client's write of the Flow's metadata decides nothing about whose key pays for its
// result checks. The one way in is the request's own grant, made as its authenticated actor.

const NAMED_BY_CLIENT = { keyId: "key.someone-elses", authorizedByUserId: "user.other", authorizationId: "result-check:named", grantedThrough: { kind: "person" } };
const STORED = { keyId: "key.own", authorizedByUserId: "user.owner", authorizationId: "result-check:own", grantedThrough: { kind: "person" } };
const NOW = 1_800_000_000_000;

function withCheck(check: Record<string, unknown>): Record<string, unknown> {
  return { trainingModeSettings: { resultCheck: check } };
}

describe("a Flow's standing result-check authorization", () => {
  it("is not set by a client when none is stored", () => {
    const merged = withStoredCheckAuthorization(withCheck({ enabled: true, authorization: NAMED_BY_CLIENT }), undefined);
    expect(merged).toEqual(withCheck({ enabled: true }));
  });

  it("is not replaced by a client, and what is stored stays", () => {
    const merged = withStoredCheckAuthorization(withCheck({ enabled: false, authorization: NAMED_BY_CLIENT }), withCheck({ enabled: true, authorization: STORED }));
    expect(merged).toEqual(withCheck({ enabled: false, authorization: STORED }));
  });

  it("stays when a client's patch does not mention it", () => {
    const merged = withStoredCheckAuthorization({ trainingModeSettings: { resultCheck: { enabled: false } } }, withCheck({ authorization: STORED }));
    expect(merged).toEqual(withCheck({ enabled: false, authorization: STORED }));
  });

  it("leaves everything else in the metadata alone", () => {
    const merged = withStoredCheckAuthorization({ other: 1, trainingModeSettings: { keep: true } }, undefined);
    expect(merged).toEqual({ other: 1, trainingModeSettings: { keep: true } });
  });

  it("is replaced by the request's own grant, and removed when the request withdraws it", () => {
    const granted = { ...STORED, authorizationId: "result-check:new" } as any;
    expect(withStoredCheckAuthorization(withCheck({ enabled: true, authorization: NAMED_BY_CLIENT }), withCheck({ authorization: STORED }), granted)).toEqual(withCheck({ enabled: true, authorization: granted }));
    expect(withStoredCheckAuthorization({ other: 1 }, undefined, granted)).toEqual({ other: 1, trainingModeSettings: { resultCheck: { authorization: granted } } });
    expect(withStoredCheckAuthorization(withCheck({ enabled: true }), withCheck({ authorization: STORED }), null)).toEqual(withCheck({ enabled: true }));
  });
});

describe("who a result-check grant is made as", () => {
  const trustedClientIdOf = (sessionId: string) => (sessionId === "gateway.1" ? "client.one" : undefined);

  it("is the signed-in person on a panel session", () => {
    expect(automationStudioResultCheckGrantorOf({ userId: "user.owner", sessionId: "session.1", channel: "panel" }, trustedClientIdOf)).toEqual({ userId: "user.owner", grantedThrough: { kind: "person" } });
  });

  it("is the paired client acting for its person, with no panel session", () => {
    expect(automationStudioResultCheckGrantorOf({ userId: "user.owner", sessionId: "client-gateway:gateway.1", channel: "paired-client" }, trustedClientIdOf)).toEqual({ userId: "user.owner", grantedThrough: { kind: "client", trustedClientId: "client.one" } });
  });

  it("is nobody for a client the gateway no longer knows, a service identity, or no actor", () => {
    expect(automationStudioResultCheckGrantorOf({ userId: "user.owner", sessionId: "client-gateway:gateway.gone", channel: "paired-client" }, trustedClientIdOf)).toBeNull();
    expect(automationStudioResultCheckGrantorOf({ userId: "user.owner", sessionId: "odd", channel: "paired-client" }, trustedClientIdOf)).toBeNull();
    expect(automationStudioResultCheckGrantorOf({ userId: "service", sessionId: "s", serviceIdentity: { id: "svc" } }, trustedClientIdOf)).toBeNull();
    expect(automationStudioResultCheckGrantorOf(undefined, trustedClientIdOf)).toBeNull();
  });

  it("builds the grant from the actor, never from the request body", () => {
    const granted = automationStudioResultCheckGrantForRequest({ value: { keyId: "key.own", authorizedByUserId: "user.other", grantedThrough: { kind: "person" } }, actor: { userId: "user.owner", sessionId: "client-gateway:gateway.1", channel: "paired-client" }, trustedClientIdOf, nowMs: NOW });
    expect(granted).toMatchObject({ authorizedByUserId: "user.owner", grantedThrough: { kind: "client", trustedClientId: "client.one" }, keyId: "key.own", grantedAtMs: NOW });
    expect(granted?.authorizationId).toMatch(/^result-check:/);
  });

  it("asks nothing, withdraws, or refuses an actor that may not grant", () => {
    expect(automationStudioResultCheckGrantForRequest({ value: undefined, actor: undefined, nowMs: NOW })).toBeUndefined();
    expect(automationStudioResultCheckGrantForRequest({ value: null, actor: undefined, nowMs: NOW })).toBeNull();
    expect(() => automationStudioResultCheckGrantForRequest({ value: { keyId: "key.own" }, actor: undefined, nowMs: NOW })).toThrow("signed-in person");
  });
});
