// @fluxiq-test-group real-sql
// A Flow's standing result-check authorization, granted and used through the real
// runtime: Identity Access, the client gateway, Secret Keys' per-use authority and
// Automation Studio on isolated disk stores. No model-key unlock is called anywhere;
// the only password use is the sign-in that creates a panel session. Passwords,
// keys and ids are synthetic. No provider calls.

import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AUTOMATION_STUDIO_ENDPOINTS } from "../../../api-contracts/automation.ts";
import { automationStudioResultCheckAuthorizationFromMetadata } from "../../../framework/automation-service/service/flow-settings/index.ts";
import {
  AUTOMATION_STUDIO_RESULT_CHECK_AUTHORIZATION_CODES,
  redeemAutomationStudioResultCheckAuthorization,
  revealAutomationStudioResultCheckSecret,
  type AutomationStudioResultCheckAuthorization,
  type AutomationStudioResultCheckProviderPorts
} from "../../../runtime/result-verification/check-authorization/index.ts";
import type { FluxIQHostPaths } from "../../../framework/index.ts";
import { createGlobalProgramRuntime, type GlobalProgramRuntime } from "../../index.ts";
import type { ProgramApiActor } from "../api.ts";
import { RuntimeAccessFixture, RUNTIME_KEY_VALUE, type RuntimeClient } from "./runtime-access-fixture.ts";

let fixture: RuntimeAccessFixture;
const open = new Set<GlobalProgramRuntime>();
beforeEach(async () => {
  vi.stubEnv("FLUXIQ_PROFILE", "local");
  vi.stubEnv("FLUXIQ_SECRET_KEYS_KEYRING_FILE", "");
  fixture = await RuntimeAccessFixture.create();
});
afterEach(async () => {
  try {
    for (const runtime of [...open]) await close(runtime);
    await fixture.dispose();
  } finally {
    vi.unstubAllEnvs();
  }
});

/**
 * The fixture's composition, on the plain data-directory layout so Automation
 * Studio keeps its projects and Flows on disk: a restart reads the same Flow,
 * and its stored grant, back.
 */
function boot(): GlobalProgramRuntime {
  const fluxiq = path.join(fixture.root, ".fluxiq");
  const paths = {
    root: fixture.root, fluxiq, config: path.join(fluxiq, "result-check-config.json"), data: path.join(fluxiq, "data"), databases: path.join(fluxiq, "databases"),
    inputs: path.join(fluxiq, "inputs"), outputs: path.join(fluxiq, "outputs"), streams: path.join(fluxiq, "streams"), domains: path.join(fluxiq, "domains"),
    domainPrograms: path.join(fluxiq, "domain-programs"), domainInputs: path.join(fluxiq, "domain-inputs"), domainOutputs: path.join(fluxiq, "domain-outputs")
  } as FluxIQHostPaths;
  const runtime = createGlobalProgramRuntime(paths, { modelProvidersEnabled: false, iam: { profile: "local" } });
  open.add(runtime);
  return runtime;
}

async function close(runtime: GlobalProgramRuntime): Promise<void> {
  if (!open.delete(runtime)) return;
  runtime.detach();
  try { await runtime.automationStudio.close(); } finally { runtime.secretKeys.close(); }
}

type Login = Awaited<ReturnType<RuntimeAccessFixture["signIn"]>>;

const panelActor = (login: Login): ProgramApiActor => ({ userId: login.user.id, sessionId: login.session.id, roleId: login.role.id, permissions: login.role.permissions, channel: "panel" });

/** What `server/program-route` makes of a paired client's call: its gateway session, its person, the client-narrowed permissions. */
const clientActor = (login: Login, client: RuntimeClient): ProgramApiActor => ({
  userId: login.user.id, sessionId: `client-gateway:${client.gatewaySessionId}`, roleId: login.role.id,
  permissions: login.role.permissions.filter((permission) => ["programs.read", "programs.write", "runtime.control", "flows.write"].includes(permission)), channel: "paired-client"
});

/** The ports `programs/_shared/runtime.ts` hands the standing provider, over this runtime's Secret Keys. */
const portsOf = (runtime: GlobalProgramRuntime): AutomationStudioResultCheckProviderPorts => ({
  getKeySummary: (id) => runtime.secretKeys.getKeySummary(id),
  createUseAuthorization: (input) => runtime.secretKeys.access.createUseAuthorization(input),
  revealKeyWithAuthorization: (input) => runtime.secretKeys.revealKeyWithAuthorization(input),
  revokeRevealAuthorization: (id) => runtime.secretKeys.revokeRevealAuthorization(id)
});

async function flowIn(runtime: GlobalProgramRuntime) {
  const project = await runtime.automationStudio.createProject({ name: "Checks", domainId: "example" });
  const flow = await runtime.automationStudio.createFlow({ projectId: project.id, flowId: "flow.checks", name: "Checks" });
  return { projectId: project.id, flowId: flow.flowId };
}

async function grant(runtime: GlobalProgramRuntime, actor: ProgramApiActor, scope: { projectId: string; flowId: string }, resultCheckAuthorization: unknown) {
  return await runtime.api.call({ programId: "automation-studio", endpoint: AUTOMATION_STUDIO_ENDPOINTS.updateFlowSettings, scope: {}, actor, payload: { ...scope, flow: { metadata: {} }, resultCheckAuthorization } });
}

async function storedOf(runtime: GlobalProgramRuntime, scope: { projectId: string; flowId: string }): Promise<AutomationStudioResultCheckAuthorization | undefined> {
  const flow = await runtime.automationStudio.getFlow(scope.projectId, scope.flowId);
  return automationStudioResultCheckAuthorizationFromMetadata((flow.metadata as any)?.trainingModeSettings?.resultCheck?.authorization);
}

/** Redeems the stored grant and releases the key for one check, exactly as an unattended run's resolver does. */
async function check(runtime: GlobalProgramRuntime, scope: { projectId: string; flowId: string }, purpose: "loop_verification" | "repair" = "loop_verification"): Promise<string> {
  const redemption = redeemAutomationStudioResultCheckAuthorization({ authorization: await storedOf(runtime, scope), taskKind: "loop_verification", nowMs: Date.now(), spentUsd: 0 });
  if (!redemption.redeemed) throw new Error(`${redemption.code}: ${redemption.reason}`);
  return await revealAutomationStudioResultCheckSecret({
    ports: portsOf(runtime),
    scope: { ...scope, keyId: redemption.keyId, authorizationId: redemption.authorizationId, authorizedByUserId: redemption.authorizedByUserId, purpose, maxEstimatedCostUsd: redemption.maxEstimatedCostUsd },
    request: { ...scope, outboundBody: "{}" }
  });
}

/** Signs in as the workspace's administrator, or, with `person`, as a second person (so they can be disabled while an administrator remains). */
async function setUp(as: "admin" | "person" = "admin") {
  const runtime = boot();
  let login = await fixture.signIn(runtime);
  let password: string | undefined;
  if (as === "person") {
    password = "dummy-person-password";
    await runtime.identityAccess.upsertUser({ id: "user.person", username: "person", displayName: "Person", roleId: "admin", password });
    login = await fixture.signIn(runtime, "person", password);
  }
  const key = await fixture.createKey(runtime, login, ...(password ? [password] : []));
  const scope = await flowIn(runtime);
  return { runtime, login, key, scope };
}

describe("authorizing a Flow's result checks with no held session or unlock", () => {
  it("is granted from a panel session, records the person, and pays after logout and a Core restart with nobody signed in", async () => {
    const { runtime, login, key, scope } = await setUp();
    const answer = await grant(runtime, panelActor(login), scope, { keyId: key.id, maxTotalCostUsd: 2, maxCostUsdPerCall: 0.1 });
    expect(answer.error).toBeUndefined();
    const stored = await storedOf(runtime, scope);
    expect(stored).toMatchObject({ authorizedByUserId: login.user.id, grantedThrough: { kind: "person" }, keyId: key.id, maxTotalCostUsd: 2, maxCostUsdPerCall: 0.1 });
    expect(JSON.stringify(stored)).not.toContain(login.session.id);
    expect(await check(runtime, scope)).toBe(RUNTIME_KEY_VALUE);

    await runtime.identityAccess.revokeSession(login.session.id);
    await close(runtime);
    const restarted = boot();
    await expect(restarted.identityAccess.validateSession(login.session.id)).resolves.toBeNull();
    expect(await check(restarted, scope)).toBe(RUNTIME_KEY_VALUE);
  }, 120_000);

  it("is granted by a paired client for its person, with no panel session, and pays after a restart", async () => {
    const { runtime, login, key, scope } = await setUp();
    const client = await fixture.pair(runtime, login);
    const trustedClientId = (await fixture.principal(runtime, client, login.user.id)).trustedClientId;
    await runtime.identityAccess.revokeSession(login.session.id);
    const answer = await grant(runtime, clientActor(login, client), scope, { keyId: key.id });
    expect(answer.error).toBeUndefined();
    expect(await storedOf(runtime, scope)).toMatchObject({ authorizedByUserId: login.user.id, grantedThrough: { kind: "client", trustedClientId }, keyId: key.id });
    expect(await check(runtime, scope)).toBe(RUNTIME_KEY_VALUE);
    await close(runtime);
    expect(await check(boot(), scope)).toBe(RUNTIME_KEY_VALUE);
  }, 120_000);

  it("refuses at use once the client it was granted through is revoked", async () => {
    const { runtime, login, key, scope } = await setUp();
    const client = await fixture.pair(runtime, login);
    const trustedClientId = (await fixture.principal(runtime, client, login.user.id)).trustedClientId;
    expect((await grant(runtime, clientActor(login, client), scope, { keyId: key.id })).error).toBeUndefined();
    expect(await check(runtime, scope)).toBe(RUNTIME_KEY_VALUE);
    await runtime.clientGateway.revokeTrustedClient(trustedClientId);
    await expect(check(runtime, scope)).rejects.toThrow("not authorized");
  }, 120_000);

  it.each(["key disabled", "person disabled", "IAM denies"] as const)("refuses at use when the %s", async (change) => {
    const { runtime, login, key, scope } = await setUp("person");
    expect((await grant(runtime, panelActor(login), scope, { keyId: key.id })).error).toBeUndefined();
    expect(await check(runtime, scope)).toBe(RUNTIME_KEY_VALUE);
    if (change === "key disabled") await runtime.secretKeys.updateKey({ id: key.id, enabled: false });
    else await runtime.identityAccess.updateUser(change === "person disabled" ? { id: login.user.id, enabled: false } : { id: login.user.id, roleId: "viewer" });
    await expect(check(runtime, scope)).rejects.toThrow();
  }, 120_000);

  it("pays a repair only when the grant's repair clause is on, and nothing once withdrawn", async () => {
    const { runtime, login, key, scope } = await setUp();
    expect((await grant(runtime, panelActor(login), scope, { keyId: key.id })).error).toBeUndefined();
    await expect(check(runtime, scope, "repair")).rejects.toThrow("not authorized");
    expect((await grant(runtime, panelActor(login), scope, { keyId: key.id, repair: { enabled: true } })).error).toBeUndefined();
    expect(await check(runtime, scope, "repair")).toBe(RUNTIME_KEY_VALUE);
    const before = await storedOf(runtime, scope);
    expect((await grant(runtime, panelActor(login), scope, null)).error).toBeUndefined();
    expect(await storedOf(runtime, scope)).toBeUndefined();
    // A principal naming the withdrawn grant authorizes nothing.
    const principal = { kind: "standing" as const, userId: login.user.id, authorizationId: before!.authorizationId, ...scope, purpose: "loop_verification" as const };
    await expect(runtime.secretKeys.access.createUseAuthorization({ id: key.id, principal })).rejects.toThrow("not authorized");
  }, 120_000);

  it("never pays with another person's key, whoever names it", async () => {
    const { runtime, login, scope } = await setUp();
    const password = "dummy-other-owner-password";
    await runtime.identityAccess.upsertUser({ id: "user.other", username: "other", displayName: "Other", roleId: "admin", password });
    const foreign = await fixture.createKey(runtime, await fixture.signIn(runtime, "other", password), password);
    // The local profile lets an administrator's role use any key, so the grant
    // is stored; the key's owner check at use is what refuses it.
    expect((await grant(runtime, panelActor(login), scope, { keyId: foreign.id })).error).toBeUndefined();
    expect(await storedOf(runtime, scope)).toMatchObject({ authorizedByUserId: login.user.id, keyId: foreign.id });
    await expect(check(runtime, scope)).rejects.toThrow("not authorized");
  }, 120_000);

  it("reads a record stored under the old key unlock as needing a fresh grant, and its use is refused", async () => {
    const { runtime, login, key, scope } = await setUp();
    const legacy = { taskKind: "loop_verification", authorizedByUserId: login.user.id, unlockSessionId: login.session.id, keyId: key.id, maxTotalCostUsd: 1, maxCostUsdPerCall: 0.05, grantedAtMs: Date.now() - 1000, expiresAtMs: Date.now() + 86_400_000 };
    const flow = await runtime.automationStudio.getFlow(scope.projectId, scope.flowId);
    await runtime.automationStudio.saveFlow({ projectId: scope.projectId, flow: { ...flow, metadata: { ...(flow.metadata ?? {}), trainingModeSettings: { resultCheck: { authorization: legacy } } } } });
    const stored = await storedOf(runtime, scope);
    expect(stored?.grantedThrough).toEqual({ kind: "legacy_unlock" });
    const redemption = redeemAutomationStudioResultCheckAuthorization({ authorization: stored, taskKind: "loop_verification", nowMs: Date.now(), spentUsd: 0 });
    expect(redemption).toMatchObject({ redeemed: false, code: AUTOMATION_STUDIO_RESULT_CHECK_AUTHORIZATION_CODES.renew });
    expect(redemption.redeemed ? "" : redemption.reason).not.toMatch(/unlock|password/i);
    const principal = { kind: "standing" as const, userId: login.user.id, authorizationId: stored!.authorizationId, ...scope, purpose: "loop_verification" as const };
    await expect(runtime.secretKeys.access.createUseAuthorization({ id: key.id, principal })).rejects.toThrow("not authorized");
    // Turning checking on again replaces it with a grant that pays.
    expect((await grant(runtime, panelActor(login), scope, { keyId: key.id })).error).toBeUndefined();
    expect(await check(runtime, scope)).toBe(RUNTIME_KEY_VALUE);
  }, 120_000);
});
