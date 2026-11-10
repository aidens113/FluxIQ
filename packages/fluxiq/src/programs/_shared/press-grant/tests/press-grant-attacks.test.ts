// Adversarial review of press grants (P9-R): each test is one attack on the
// grant that replaces the PIN on destructive endpoints, run through the real
// registry and the real Identity Access service. Only the clock, the policy
// source and the endpoints' handlers stand in.

import { describe, expect, it, vi } from "vitest";
import { IAM_READ_ONLY_ACCESS, IAM_USER_ACCESS, MemoryIamAuditSink, type IamPolicy, type IamPolicySource } from "../../../../platform/iam/index.ts";
import { IdentityAccessService, type Permission } from "../../../identity-access/index.ts";
import { GlobalProgramApiRegistry, type ProgramApiActor, type ProgramApiHandler } from "../../api.ts";
import { endpointResource, type ProgramApiIamOptions } from "../../iam/index.ts";
import { PRESS_GRANT_MINT_ENDPOINT } from "../mint-endpoint.ts";
import { pressGrantPayloadDigest } from "../payload/index.ts";
import { PressGrantStore } from "../press-grant-store.ts";
import { PRESS_GRANT_REFUSALS } from "../refusals.ts";
import { registerPressGrantApi } from "../register-press-grant-api.ts";

const PASSWORD = "a-long-test-password";
const lowCost = { passwordKdf: { testOnlyWeakParameters: { N: 2 ** 10, r: 8, p: 1, keyLength: 32 } } } as const;
const PROGRAM = "automation-studio";

type Seen = { projectId: unknown; keys: string[] };

function policySource(identity: readonly IamPolicy[]): IamPolicySource {
  return { resolvePolicySet: async () => ({ identity: [...identity], guardrails: [], sessions: [], boundary: null }), getRole: async () => null };
}

async function setup(options: { iam?: Omit<ProgramApiIamOptions, "audit"> } = {}) {
  let now = 9_000_000;
  const identityAccess = new IdentityAccessService(lowCost);
  await identityAccess.setPassword("admin", PASSWORD);
  await identityAccess.upsertUser({ username: "second", displayName: "Second", roleId: "admin", password: PASSWORD });
  await identityAccess.upsertUser({ username: "reader", displayName: "Reader", roleId: "viewer", password: PASSWORD });
  const audit = new MemoryIamAuditSink();
  const store = new PressGrantStore({ now: () => now });
  const registry = new GlobalProgramApiRegistry({ identityAccess, pressGrants: store, iam: { ...options.iam, audit } });
  const seen: Seen[] = [];
  const handler = vi.fn<ProgramApiHandler>(async (request) => {
    const payload = (request.payload ?? {}) as Record<string, unknown>;
    seen.push({ projectId: payload.projectId, keys: Object.keys(payload) });
    // A handler that applies defaults by spreading, as several do.
    return { ok: true, payload: { keepRuns: ({ keepRuns: true, ...payload } as { keepRuns?: unknown }).keepRuns } };
  });
  registry.register({ programId: PROGRAM, endpoint: "delete-thing", permission: "programs.write", classification: "destructive", resource: endpointResource.project(), handler });
  registerPressGrantApi(registry);
  const signIn = async (username = "admin"): Promise<ProgramApiActor> => {
    const login = await identityAccess.authenticate({ username, password: PASSWORD });
    return { sessionId: login.session.id, userId: login.user.id, roleId: login.role.id, permissions: [...login.role.permissions] as Permission[], channel: "panel" };
  };
  const mint = (actor: ProgramApiActor, payload: unknown, extra: Record<string, unknown> = {}) => registry.call<unknown, { grant: string }>({
    ...PRESS_GRANT_MINT_ENDPOINT,
    scope: {},
    actor,
    payload: { programId: PROGRAM, endpoint: "delete-thing", payload, ...extra, authSessionId: actor.sessionId }
  });
  const grantOf = async (actor: ProgramApiActor, payload: unknown): Promise<string> => {
    const minted = await mint(actor, payload);
    if (!minted.ok || !minted.payload) throw new Error(`The test could not mint a grant: ${minted.error}`);
    return minted.payload.grant;
  };
  return { identityAccess, registry, handler, seen, audit, store, signIn, mint, grantOf, advance: (ms: number) => { now += ms; } };
}

describe("press grant attacks: payload digest canonicalisation", () => {
  it("reads undefined and missing keys alike, and key order at any depth alike", () => {
    expect(pressGrantPayloadDigest({ a: 1, b: undefined })).toBe(pressGrantPayloadDigest({ a: 1 }));
    expect(pressGrantPayloadDigest({ x: [{ b: 1, a: [2, { d: 1, c: 2 }] }] })).toBe(pressGrantPayloadDigest({ x: [{ a: [2, { c: 2, d: 1 }], b: 1 }] }));
  });

  it("keeps nested array order and depth", () => {
    expect(pressGrantPayloadDigest({ ids: [["a"], ["b"]] })).not.toBe(pressGrantPayloadDigest({ ids: [["b"], ["a"]] }));
    expect(pressGrantPayloadDigest({ ids: [["a", "b"]] })).not.toBe(pressGrantPayloadDigest({ ids: ["a", "b"] }));
    expect(pressGrantPayloadDigest({ ids: [] })).not.toBe(pressGrantPayloadDigest({ ids: {} }));
  });

  it("tells apart text that only looks alike: Unicode forms, lone surrogates, a number and its text", () => {
    const composed = "Café";
    const decomposed = "Café";
    expect(pressGrantPayloadDigest({ name: composed })).not.toBe(pressGrantPayloadDigest({ name: decomposed }));
    expect(pressGrantPayloadDigest({ [composed]: 1 })).not.toBe(pressGrantPayloadDigest({ [decomposed]: 1 }));
    expect(pressGrantPayloadDigest({ id: "\ud800" })).not.toBe(pressGrantPayloadDigest({ id: "\udc00" }));
    expect(pressGrantPayloadDigest({ id: "\ud800" })).not.toBe(pressGrantPayloadDigest({ id: "�" }));
    expect(pressGrantPayloadDigest({ n: 1 })).not.toBe(pressGrantPayloadDigest({ n: "1" }));
  });

  it("reads number forms as the handler does: 1 and 1.0 (one JavaScript number) alike, 1 and 1.5 not", () => {
    expect(pressGrantPayloadDigest(JSON.parse('{"n":1.0}'))).toBe(pressGrantPayloadDigest(JSON.parse('{"n":1}')));
    expect(pressGrantPayloadDigest(JSON.parse('{"n":1e0}'))).toBe(pressGrantPayloadDigest({ n: 1 }));
    expect(pressGrantPayloadDigest({ n: 1 })).not.toBe(pressGrantPayloadDigest({ n: 1.5 }));
  });

  it("counts an own __proto__ key, as a JSON body carries it, and never reads it as a prototype", () => {
    const withProto = JSON.parse('{"id":"x","__proto__":{"projectId":"victim"}}') as Record<string, unknown>;
    expect(Object.hasOwn(withProto, "__proto__")).toBe(true);
    expect(pressGrantPayloadDigest(withProto)).not.toBe(pressGrantPayloadDigest({ id: "x" }));
    expect(pressGrantPayloadDigest(withProto)).toBe(pressGrantPayloadDigest(JSON.parse('{"__proto__":{"projectId":"victim"},"id":"x"}')));
    expect(pressGrantPayloadDigest({ constructor: "x" })).not.toBe(pressGrantPayloadDigest({}));
  });

  it("drops only the two top-level carriers, never via, authorizationPin or a nested carrier", () => {
    expect(pressGrantPayloadDigest({ id: "x", via: "assistant" })).not.toBe(pressGrantPayloadDigest({ id: "x" }));
    expect(pressGrantPayloadDigest({ id: "x", authorizationPin: "" })).not.toBe(pressGrantPayloadDigest({ id: "x" }));
    expect(pressGrantPayloadDigest({ id: "x", inner: { pressGrant: "g" } })).not.toBe(pressGrantPayloadDigest({ id: "x", inner: {} }));
  });
});

describe("press grant attacks: through the registry", () => {
  it("lets exactly one of many concurrent calls spend one grant", async () => {
    const { registry, handler, signIn, grantOf } = await setup();
    const person = await signIn();
    const grant = await grantOf(person, { projectId: "project.one" });
    const calls = Array.from({ length: 12 }, () => registry.call({ programId: PROGRAM, endpoint: "delete-thing", scope: {}, actor: person, payload: { projectId: "project.one", pressGrant: grant, authSessionId: person.sessionId } }));
    const answers = await Promise.all(calls);
    expect(answers.filter((answer) => answer.ok)).toHaveLength(1);
    expect(answers.filter((answer) => !answer.ok).every((answer) => answer.error === PRESS_GRANT_REFUSALS.pressAgain)).toBe(true);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("refuses a grant after sign-out, and in the person's next session", async () => {
    const { registry, identityAccess, handler, signIn, grantOf } = await setup();
    const before = await signIn();
    const grant = await grantOf(before, { projectId: "project.one" });
    await identityAccess.revokeUserSessions("admin");
    const after = await signIn();
    const call = (actor: ProgramApiActor) => registry.call({ programId: PROGRAM, endpoint: "delete-thing", scope: {}, actor, payload: { projectId: "project.one", pressGrant: grant, authSessionId: actor.sessionId } });
    expect(await call(before)).toEqual({ ok: false, error: PRESS_GRANT_REFUSALS.signIn });
    expect(await call(after)).toEqual({ ok: false, error: PRESS_GRANT_REFUSALS.pressAgain });
    expect(handler).not.toHaveBeenCalled();
  });

  it("ignores a via, pressGrant or authorizationPin smuggled into the mint's body or the assistant's payload", async () => {
    const { registry, handler, signIn, mint, grantOf } = await setup();
    const person = await signIn();
    // A body field cannot make the server-set `via` absent: the assistant's mint is refused whatever the body says.
    expect(await registry.call({ ...PRESS_GRANT_MINT_ENDPOINT, scope: {}, actor: person, via: "assistant", payload: { programId: PROGRAM, endpoint: "delete-thing", payload: {}, via: undefined } }))
      .toMatchObject({ ok: false, error: PRESS_GRANT_REFUSALS.personOnly });
    // A `via` in the person's own payload is just a field of the act (and part of its digest).
    const grant = await grantOf(person, { projectId: "project.one" });
    expect(await registry.call({ programId: PROGRAM, endpoint: "delete-thing", scope: {}, actor: person, payload: { projectId: "project.one", via: "assistant", pressGrant: grant, authSessionId: person.sessionId } }))
      .toEqual({ ok: false, error: PRESS_GRANT_REFUSALS.pressAgain });
    // The assistant's model cannot carry any confirmation, even an empty one.
    for (const smuggled of [{ pressGrant: "" }, { authorizationPin: "" }, { pressGrant: null }]) {
      const fresh = await grantOf(person, { projectId: "project.one" });
      expect(await registry.call({ programId: PROGRAM, endpoint: "delete-thing", scope: {}, actor: person, via: "assistant", pressGrant: fresh, payload: { projectId: "project.one", ...smuggled } }))
        .toEqual({ ok: false, error: PRESS_GRANT_REFUSALS.personOnly });
    }
    expect(handler).not.toHaveBeenCalled();
    // A mint body's own `pressGrant` or `authorizationPin` never stands in for the person's check.
    expect((await mint(person, { projectId: "project.one" }, { authorizationPin: "000000", pressGrant: "x" })).ok).toBe(true);
  });

  it("decides, confirms and handles a destructive call on the payload as sent, so nothing its digest cannot see reaches IAM or the handler", async () => {
    const { registry, handler, seen, audit, signIn, grantOf } = await setup();
    const person = await signIn();
    // Server code (the assistant's confirm path) hands the grant over; the
    // payload it passes carries what JSON would not: an inherited field, an
    // undefined own field, a toJSON.
    const inherited = Object.assign(Object.create({ projectId: "project.victim" }) as Record<string, unknown>, { flowId: "flow.old" });
    const grantOne = await grantOf(person, { flowId: "flow.old" });
    const rowsBefore = audit.records.length;
    expect(await registry.call({ programId: PROGRAM, endpoint: "delete-thing", scope: {}, actor: person, via: "assistant", pressGrant: grantOne, payload: inherited })).toMatchObject({ ok: true });
    expect(audit.records.slice(rowsBefore).flatMap((row) => row.resources).join(" ")).not.toContain("project.victim");

    const grantTwo = await grantOf(person, { flowId: "flow.old" });
    expect(await registry.call({ programId: PROGRAM, endpoint: "delete-thing", scope: {}, actor: person, via: "assistant", pressGrant: grantTwo, payload: { flowId: "flow.old", keepRuns: undefined } }))
      .toEqual({ ok: true, payload: { keepRuns: true } });

    const grantThree = await grantOf(person, { flowId: "flow.old" });
    const disguised = { projectId: "project.victim", flowId: "flow.old", toJSON: () => ({ flowId: "flow.old" }) };
    expect(await registry.call({ programId: PROGRAM, endpoint: "delete-thing", scope: {}, actor: person, via: "assistant", pressGrant: grantThree, payload: disguised })).toMatchObject({ ok: true });

    expect(seen).toEqual([
      { projectId: undefined, keys: ["flowId"] },
      { projectId: undefined, keys: ["flowId"] },
      { projectId: undefined, keys: ["flowId"] }
    ]);
  });

  it("answers a destructive payload JSON cannot carry with a refusal, before any decision", async () => {
    const { registry, handler, signIn } = await setup();
    const person = await signIn();
    const cyclic: Record<string, unknown> = { projectId: "project.one" };
    cyclic.self = cyclic;
    const answer = await registry.call({ programId: PROGRAM, endpoint: "delete-thing", scope: {}, actor: person, payload: cyclic });
    expect(answer).toEqual({ ok: false, error: "The action's details could not be read." });
    expect(handler).not.toHaveBeenCalled();
  });

  it("reads whether a call carries a PIN once, so a payload cannot choose the PIN path for IAM and the grant path for the confirmation", async () => {
    const { registry, handler, signIn, grantOf } = await setup();
    const person = await signIn();
    const grant = await grantOf(person, { flowId: "flow.old", authorizationPin: "" });
    let reads = 0;
    const shifty = Object.create({ projectId: "project.victim" }) as Record<string, unknown>;
    Object.defineProperty(shifty, "flowId", { value: "flow.old", enumerable: true });
    Object.defineProperty(shifty, "authorizationPin", { enumerable: true, get: () => (reads++ === 0 ? "123456" : "") });
    const answer = await registry.call({ programId: PROGRAM, endpoint: "delete-thing", scope: {}, actor: person, pressGrant: grant, payload: shifty });
    expect(answer.ok).toBe(false);
    expect(handler).not.toHaveBeenCalled();
  });

  it("decides a server-side mint on the payload as sent, never on a field its grant does not bind", async () => {
    const { registry, audit, signIn } = await setup();
    const person = await signIn();
    const inherited = Object.assign(Object.create({ projectId: "project.victim" }) as Record<string, unknown>, { flowId: "flow.old" });
    const rowsBefore = audit.records.length;
    expect((await registry.mintPressGrant({ actor: person, consent: "press", programId: PROGRAM, endpoint: "delete-thing", payload: inherited })).ok).toBe(true);
    expect(audit.records.slice(rowsBefore).flatMap((row) => row.resources).join(" ")).not.toContain("project.victim");
  });

  it("never mints for a viewer, who may not delete", async () => {
    const { signIn, mint } = await setup();
    const reader = await signIn("reader");
    expect(await mint(reader, { projectId: "project.one" })).toMatchObject({ ok: false, errorCode: "authorization.forbidden" });
  });
});

describe("press grant attacks: the hosted service profile", () => {
  async function hosted(identity: readonly IamPolicy[]) {
    const context = await setup({ iam: { profile: "service", source: policySource(identity) } });
    const alice = await context.signIn("admin");
    const bob = await context.signIn("second");
    context.registry.registerResourceOwners("project", {
      ownerOf: async (id) => (id.startsWith("a-") ? alice.userId : id.startsWith("b-") ? bob.userId : null),
      recordOwner: async () => undefined
    });
    return { ...context, alice, bob };
  }

  it("lets a user member mint only for their own project, and a grant for theirs never reaches another's", async () => {
    const { registry, handler, mint, grantOf, alice, bob } = await hosted([IAM_USER_ACCESS]);
    expect(await mint(bob, { projectId: "a-1" })).toMatchObject({ ok: false, errorCode: "authorization.forbidden" });
    const own = await grantOf(bob, { projectId: "b-1" });
    expect(await registry.call({ programId: PROGRAM, endpoint: "delete-thing", scope: {}, actor: bob, payload: { projectId: "a-1", pressGrant: own, authSessionId: bob.sessionId } }))
      .toMatchObject({ ok: false, errorCode: "authorization.forbidden" });
    expect(handler).not.toHaveBeenCalled();
    // The refused call left the grant unspent, and it still confirms only its own act.
    expect(await registry.call({ programId: PROGRAM, endpoint: "delete-thing", scope: {}, actor: bob, payload: { projectId: "b-1", pressGrant: own, authSessionId: bob.sessionId } })).toMatchObject({ ok: true });
    expect((await mint(alice, { projectId: "a-1" })).ok).toBe(true);
  });

  it("lets a read-only member reach the mint but never mint for a delete", async () => {
    const { mint, bob } = await hosted([IAM_READ_ONLY_ACCESS]);
    expect(await mint(bob, { projectId: "b-1" })).toMatchObject({ ok: false, errorCode: "authorization.forbidden" });
  });
});

describe("press grant attacks: the store's memory", () => {
  it("forgets expired grants of every session on the next mint", () => {
    let now = 1_000;
    const store = new PressGrantStore({ now: () => now });
    for (let session = 0; session < 200; session += 1) {
      for (let press = 0; press < 16; press += 1) store.mint({ sessionId: `s${session}`, actorId: "u", programId: PROGRAM, endpoint: "delete-thing", payload: { n: press } }, "press");
    }
    const held = Reflect.get(store, "held") as Map<string, unknown>;
    expect(held.size).toBe(200 * 16);
    now += 60_000;
    store.mint({ sessionId: "late", actorId: "u", programId: PROGRAM, endpoint: "delete-thing", payload: {} }, "press");
    expect(held.size).toBe(1);
  });
});
