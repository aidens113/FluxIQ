// Press grants through the registry, against the real Identity Access service:
// a person's own press mints a grant, the destructive call it confirms runs
// once, and nothing else (the assistant, a paired client, another session or
// person, a changed payload, a late or second use) gets through. Only the
// clock and the endpoints' handlers stand in.

import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { MemoryIamAuditSink } from "../../../../platform/iam/index.ts";
import { adminRole, IdentityAccessService, type Permission } from "../../../identity-access/index.ts";
import { GlobalProgramApiRegistry, type ProgramApiActor, type ProgramApiHandler } from "../../api.ts";
import { PRESS_GRANT_MINT_ENDPOINT } from "../mint-endpoint.ts";
import { PressGrantStore } from "../press-grant-store.ts";
import { PRESS_GRANT_REFUSALS } from "../refusals.ts";
import { registerPressGrantApi } from "../register-press-grant-api.ts";

const PASSWORD = "a-long-test-password";
const lowCost = { passwordKdf: { testOnlyWeakParameters: { N: 2 ** 10, r: 8, p: 1, keyLength: 32 } } } as const;
const TARGET = { projectId: "project.one", flowId: "flow.old" };

async function setup(options: { pin?: string } = {}) {
  let now = 5_000_000;
  const identityAccess = new IdentityAccessService(lowCost);
  await identityAccess.setPassword("admin", PASSWORD);
  if (options.pin) await identityAccess.setPin("admin", options.pin);
  const audit = new MemoryIamAuditSink();
  const registry = new GlobalProgramApiRegistry({ identityAccess, pressGrants: new PressGrantStore({ now: () => now }), iam: { audit } });
  const handler = vi.fn<ProgramApiHandler>(async (request) => ({ ok: true, payload: { seen: request.payload, pressGrant: (request as { pressGrant?: unknown }).pressGrant } }));
  registry.register({ programId: "automation-studio", endpoint: "delete-thing", permission: "programs.write", classification: "destructive", handler });
  registry.register({ programId: "automation-studio", endpoint: "save-thing", permission: "programs.write", classification: "authoring", handler: () => ({ ok: true }) });
  registry.register({ programId: "automation-studio", endpoint: "delete-secret-thing", permission: "secrets.manage", classification: "destructive", handler: () => ({ ok: true }) });
  registerPressGrantApi(registry);
  const signIn = async (username = "admin"): Promise<ProgramApiActor> => {
    const login = await identityAccess.authenticate({ username, password: PASSWORD });
    return { sessionId: login.session.id, userId: login.user.id, roleId: login.role.id, permissions: [...login.role.permissions] as Permission[], channel: "panel" };
  };
  const person = await signIn();
  const mint = (actor: ProgramApiActor, target: { programId?: string; endpoint?: string; payload?: unknown } = {}, via?: "assistant") => registry.call<unknown, { grant: string; expiresAt: number }>({
    ...PRESS_GRANT_MINT_ENDPOINT,
    scope: {},
    actor,
    ...(via ? { via } : {}),
    // As the panel route sends it: the person's session added at the top level.
    payload: { programId: "automation-studio", endpoint: "delete-thing", payload: TARGET, ...target, authSessionId: actor.sessionId }
  });
  const grantOf = async (actor: ProgramApiActor = person, target: { programId?: string; endpoint?: string; payload?: unknown } = {}): Promise<string> => {
    const minted = await mint(actor, target);
    if (!minted.ok || !minted.payload) throw new Error(`The test could not mint a grant: ${minted.error}`);
    return minted.payload.grant;
  };
  const destroy = (actor: ProgramApiActor, payload: Record<string, unknown>, extra: { via?: "assistant"; pressGrant?: string; endpoint?: string } = {}) => registry.call({
    programId: "automation-studio",
    endpoint: extra.endpoint ?? "delete-thing",
    scope: {},
    actor,
    payload: { ...TARGET, authSessionId: actor.sessionId, ...payload },
    ...(extra.via ? { via: extra.via } : {}),
    ...(extra.pressGrant ? { pressGrant: extra.pressGrant } : {})
  });
  return { identityAccess, registry, handler, audit, person, signIn, mint, grantOf, destroy, advance: (ms: number) => { now += ms; } };
}

describe("press grants through the registry", () => {
  it("refuses a destructive call with no confirmation from a person with no PIN, and never reaches the handler", async () => {
    const { person, destroy, handler } = await setup();
    expect(await destroy(person, {})).toEqual({ ok: false, error: PRESS_GRANT_REFUSALS.pressAllow });
    expect(handler).not.toHaveBeenCalled();
  });

  it("runs the call a person's press minted a grant for, once, and hands the handler no grant", async () => {
    const { person, mint, destroy, handler, audit } = await setup();
    const minted = await mint(person);
    expect(minted.ok).toBe(true);
    const grant = minted.payload!.grant;
    expect(minted.payload!.expiresAt).toBe(5_000_000 + 60_000);
    const done = await destroy(person, { pressGrant: grant });
    expect(done).toEqual({ ok: true, payload: { seen: { ...TARGET, authSessionId: person.sessionId }, pressGrant: undefined } });
    expect(handler).toHaveBeenCalledTimes(1);
    const replay = await destroy(person, { pressGrant: grant });
    expect(replay).toEqual({ ok: false, error: PRESS_GRANT_REFUSALS.pressAgain });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(audit.records)).not.toContain(grant);
  });

  it("audits how each grant was earned, on its mint's row and its call's, and never the grant or a digest of it (review P9-R2, S3)", async () => {
    const { registry, person, mint, destroy, audit } = await setup();
    // A page's mint is a press, whatever its body says.
    const pressed = await registry.call<unknown, { grant: string }>({ ...PRESS_GRANT_MINT_ENDPOINT, scope: {}, actor: person, payload: { programId: "automation-studio", endpoint: "delete-thing", payload: TARGET, consent: "words", authSessionId: person.sessionId } });
    const pressGrant = pressed.payload!.grant;
    expect(audit.records.map((row) => [row.action, row.via, row.consent])).toEqual([["iam:MintPressGrant", undefined, undefined], ["studio:DeleteThing", undefined, "press"]]);
    expect((await destroy(person, { pressGrant })).ok).toBe(true);
    expect(audit.records.at(-1)).toMatchObject({ action: "studio:DeleteThing", consent: "press" });
    expect(audit.records.at(-1)).not.toHaveProperty("via");
    // Server code minting on the person's own words, then the assistant's call it confirms.
    const before = audit.records.length;
    const asked = await registry.mintPressGrant({ actor: person, consent: "words", scope: {}, programId: "automation-studio", endpoint: "delete-thing", payload: TARGET });
    const wordsGrant = asked.payload!.grant;
    expect(await destroy(person, {}, { via: "assistant", pressGrant: wordsGrant })).toMatchObject({ ok: true });
    expect(audit.records.slice(before).map((row) => [row.action, row.via, row.consent])).toEqual([["studio:DeleteThing", undefined, "words"], ["studio:DeleteThing", "assistant", "words"]]);
    // A call whose grant does not confirm it says nothing about consent.
    const stale = await mint(person);
    const refused = audit.records.length;
    expect((await destroy(person, { flowId: "flow.other", pressGrant: stale.payload!.grant })).ok).toBe(false);
    expect(audit.records.at(refused)).not.toHaveProperty("consent");
    const rows = JSON.stringify(audit.records);
    for (const grant of [pressGrant, wordsGrant, stale.payload!.grant]) {
      expect(rows).not.toContain(grant);
      expect(rows).not.toContain(createHash("sha256").update(grant).digest("hex"));
    }
  });

  it("refuses a mint whose consent is neither a press nor the person's words", async () => {
    const { registry, person } = await setup();
    expect(await registry.mintPressGrant({ actor: person, consent: JSON.parse('"model"') as "press", programId: "automation-studio", endpoint: "delete-thing", payload: TARGET }))
      .toEqual({ ok: false, error: PRESS_GRANT_REFUSALS.personOnly, errorCode: "authorization.forbidden" });
  });

  it("refuses a grant used 61 seconds after the press", async () => {
    const { person, grantOf, destroy, handler, advance } = await setup();
    const grant = await grantOf();
    advance(61_000);
    expect(await destroy(person, { pressGrant: grant })).toEqual({ ok: false, error: PRESS_GRANT_REFUSALS.pressAgain });
    expect(handler).not.toHaveBeenCalled();
  });

  it("refuses a grant with another payload, on another endpoint, from another session or by another person", async () => {
    const { identityAccess, person, signIn, grantOf, destroy, handler } = await setup();
    expect(await destroy(person, { flowId: "flow.precious", pressGrant: await grantOf() })).toMatchObject({ ok: false, error: PRESS_GRANT_REFUSALS.pressAgain });
    expect(await destroy(person, { pressGrant: await grantOf(person, { endpoint: "delete-secret-thing" }) })).toMatchObject({ ok: false, error: PRESS_GRANT_REFUSALS.pressAgain });
    const otherSession = await signIn();
    expect(await destroy(otherSession, { pressGrant: await grantOf() })).toMatchObject({ ok: false, error: PRESS_GRANT_REFUSALS.pressAgain });
    await identityAccess.upsertUser({ username: "second", displayName: "Second", roleId: "admin", password: PASSWORD });
    const otherPerson = await signIn("second");
    expect(await destroy(otherPerson, { pressGrant: await grantOf() })).toMatchObject({ ok: false, error: PRESS_GRANT_REFUSALS.pressAgain });
    expect(handler).not.toHaveBeenCalled();
  });

  it("spends the grant even when the call then fails", async () => {
    const { registry, person, grantOf, destroy } = await setup();
    const failing = vi.fn<ProgramApiHandler>(async () => { throw new Error("The store was busy."); });
    registry.register({ programId: "automation-studio", endpoint: "delete-fragile-thing", permission: "programs.write", classification: "destructive", handler: failing });
    const grant = await grantOf(person, { endpoint: "delete-fragile-thing" });
    expect(await destroy(person, { pressGrant: grant }, { endpoint: "delete-fragile-thing" })).toEqual({ ok: false, error: "The store was busy." });
    expect(await destroy(person, { pressGrant: grant }, { endpoint: "delete-fragile-thing" })).toEqual({ ok: false, error: PRESS_GRANT_REFUSALS.pressAgain });
    expect(failing).toHaveBeenCalledTimes(1);
  });

  it("refuses a grant once the session that pressed has signed out", async () => {
    const { identityAccess, person, grantOf, destroy, handler } = await setup();
    const grant = await grantOf();
    await identityAccess.revokeUserSessions("admin");
    expect(await destroy(person, { pressGrant: grant })).toEqual({ ok: false, error: PRESS_GRANT_REFUSALS.signIn });
    expect(handler).not.toHaveBeenCalled();
  });

  it("refuses a grant on a call whose payload names a session that is not the caller's", async () => {
    const { person, signIn, grantOf, destroy, handler } = await setup();
    const other = await signIn();
    expect(await destroy(person, { pressGrant: await grantOf(), authSessionId: other.sessionId })).toEqual({ ok: false, error: PRESS_GRANT_REFUSALS.pressAgain });
    expect(handler).not.toHaveBeenCalled();
  });

  it("never lets the assistant mint, through the endpoint or the server-side function", async () => {
    const { registry, person, mint } = await setup();
    expect(await mint(person, {}, "assistant")).toEqual({ ok: false, error: PRESS_GRANT_REFUSALS.personOnly, errorCode: "authorization.forbidden" });
    expect(await registry.mintPressGrant({ actor: person, via: "assistant", consent: "words", programId: "automation-studio", endpoint: "delete-thing", payload: TARGET }))
      .toEqual({ ok: false, error: PRESS_GRANT_REFUSALS.personOnly, errorCode: "authorization.forbidden" });
  });

  it("never lets a paired client, a caller with no live session of its own, or no caller mint", async () => {
    const { registry, person, mint } = await setup();
    const paired: ProgramApiActor = { ...person, sessionId: "client-gateway:gateway.one", channel: "paired-client" };
    expect(await mint(paired)).toMatchObject({ ok: false, error: PRESS_GRANT_REFUSALS.personOnly });
    const noChannel: ProgramApiActor = { sessionId: person.sessionId, userId: person.userId, roleId: person.roleId, permissions: person.permissions };
    expect(await mint(noChannel)).toMatchObject({ ok: false, error: PRESS_GRANT_REFUSALS.personOnly });
    expect(await mint({ ...person, sessionId: "not-a-session" })).toMatchObject({ ok: false, error: PRESS_GRANT_REFUSALS.signIn });
    expect(await mint({ ...person, userId: "someone-else" })).toMatchObject({ ok: false, error: PRESS_GRANT_REFUSALS.signIn });
    expect(await registry.mintPressGrant({ actor: undefined, consent: "press", programId: "automation-studio", endpoint: "delete-thing" })).toMatchObject({ ok: false, errorCode: "authorization.required" });
  });

  it("mints only for a destructive endpoint the person may call", async () => {
    const { person, mint } = await setup();
    expect(await mint(person, { endpoint: "save-thing" })).toEqual({ ok: false, error: PRESS_GRANT_REFUSALS.notConfirmable });
    expect(await mint(person, { endpoint: "no-such-thing" })).toEqual({ ok: false, error: PRESS_GRANT_REFUSALS.notConfirmable });
    const narrowed: ProgramApiActor = { ...person, permissions: adminRole.permissions.filter((permission) => permission !== "secrets.manage") };
    expect(await mint(narrowed, { endpoint: "delete-secret-thing" })).toMatchObject({ ok: false, errorCode: "authorization.forbidden" });
  });

  it("confirms the assistant's call only with a grant server code hands over, never one in the model's payload, and audits it as the assistant's", async () => {
    const { person, grantOf, destroy, handler, audit } = await setup();
    const grant = await grantOf();
    // The person's mint: its own decision and the target's, both theirs.
    const minted = audit.records.slice();
    expect(minted.map((row) => row.action)).toEqual(["iam:MintPressGrant", "studio:DeleteThing"]);
    expect(minted.every((row) => row.via === undefined)).toBe(true);
    expect(await destroy(person, { pressGrant: grant }, { via: "assistant" })).toEqual({ ok: false, error: PRESS_GRANT_REFUSALS.personOnly });
    expect(await destroy(person, { authorizationPin: "123456" }, { via: "assistant" })).toEqual({ ok: false, error: PRESS_GRANT_REFUSALS.personOnly });
    expect(handler).not.toHaveBeenCalled();
    expect(await destroy(person, {}, { via: "assistant", pressGrant: grant })).toMatchObject({ ok: true });
    const assistantRows = audit.records.slice(minted.length);
    expect(assistantRows.map((row) => row.action)).toEqual(["studio:DeleteThing", "studio:DeleteThing", "studio:DeleteThing"]);
    expect(assistantRows.every((row) => row.via === "assistant")).toBe(true);
  });

  it("asks a person who turned a PIN on for the PIN, and a press never stands in for it", async () => {
    const { identityAccess, person, mint, grantOf, destroy, handler } = await setup();
    const pressedBefore = await grantOf();
    await identityAccess.setPin("admin", "246810");
    expect(await mint(person)).toEqual({ ok: false, error: PRESS_GRANT_REFUSALS.pinRequired });
    expect(await destroy(person, {})).toEqual({ ok: false, error: PRESS_GRANT_REFUSALS.pinRequired });
    expect(await destroy(person, { pressGrant: pressedBefore })).toEqual({ ok: false, error: PRESS_GRANT_REFUSALS.pinRequired });
    expect(await destroy(person, {}, { pressGrant: pressedBefore })).toEqual({ ok: false, error: PRESS_GRANT_REFUSALS.pinRequired });
    expect(await destroy(person, { authorizationPin: "000000" })).toEqual({ ok: false, error: "Invalid PIN" });
    expect(handler).not.toHaveBeenCalled();
    expect(await destroy(person, { authorizationPin: "246810" })).toMatchObject({ ok: true });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("still takes the PIN of a person who set one from the start", async () => {
    const { person, destroy, handler } = await setup({ pin: "135790" });
    expect(await destroy(person, { authorizationPin: "135790" })).toMatchObject({ ok: true });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("leaves read and authoring calls as they were, and drops a stray grant before their handler", async () => {
    const { registry, person } = await setup();
    const authoring = vi.fn<ProgramApiHandler>(async (request) => ({ ok: true, payload: request.payload }));
    registry.register({ programId: "automation-studio", endpoint: "rename-thing", permission: "programs.write", classification: "authoring", handler: authoring });
    expect(await registry.call({ programId: "automation-studio", endpoint: "rename-thing", scope: {}, actor: person, payload: { name: "New", pressGrant: "anything" } }))
      .toEqual({ ok: true, payload: { name: "New" } });
  });
});
