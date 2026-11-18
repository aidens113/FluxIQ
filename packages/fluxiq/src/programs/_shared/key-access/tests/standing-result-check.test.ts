// @fluxiq-test-group real-sql
// A Flow's result check gets model access with no unlock and no held session
// (t928): the person turns checking on once, and each unattended check is
// authorized afresh as their standing grant, re-checked against the stored
// grant, the key's consent and IAM. Real program runtime on a temporary disk
// root (Automation Studio keeps Flows only on disk); no `unlockSession` is
// called anywhere; dummy values; no provider calls.

import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FluxIQHostPaths } from "../../../../framework/index.ts";
import { AUTOMATION_STUDIO_ENDPOINTS } from "../../../../api-contracts/automation.ts";
import { automationStudioResultCheckAuthorizationFromMetadata } from "../../../../framework/automation-service/service/flow-settings/index.ts";
import { redeemAutomationStudioResultCheckAuthorization, revealAutomationStudioResultCheckSecret } from "../../../../runtime/result-verification/check-authorization/index.ts";
import { createGlobalProgramRuntime, type GlobalProgramRuntime } from "../../../index.ts";
import { actorFor } from "../../../tests/login-actor.ts";

const OWN_VALUE = "dummy-own-key-value";
const LENT_VALUE = "dummy-lent-key-value";

let root = "";
const open = new Set<GlobalProgramRuntime>();
beforeEach(async () => {
  vi.stubEnv("FLUXIQ_PROFILE", "local");
  vi.stubEnv("FLUXIQ_SECRET_KEYS_KEYRING_FILE", "");
  root = await mkdtemp(path.join(os.tmpdir(), "fluxiq-standing-check-"));
});
afterEach(async () => {
  try {
    for (const runtime of [...open]) {
      open.delete(runtime);
      runtime.detach();
      try { await runtime.automationStudio.close(); } finally { runtime.secretKeys.close(); }
    }
    await rm(root, { recursive: true, force: true });
  } finally {
    vi.unstubAllEnvs();
  }
});

function boot(): GlobalProgramRuntime {
  const fluxiq = path.join(root, ".fluxiq");
  const paths = {
    root, fluxiq, config: path.join(fluxiq, "standing-check-config.json"), data: path.join(fluxiq, "data"), databases: path.join(fluxiq, "databases"),
    inputs: path.join(fluxiq, "inputs"), outputs: path.join(fluxiq, "outputs"), streams: path.join(fluxiq, "streams"), domains: path.join(fluxiq, "domains"),
    domainPrograms: path.join(fluxiq, "domain-programs"), domainInputs: path.join(fluxiq, "domain-inputs"), domainOutputs: path.join(fluxiq, "domain-outputs")
  } as FluxIQHostPaths;
  const runtime = createGlobalProgramRuntime(paths, { modelProvidersEnabled: false, iam: { profile: "local" } });
  open.add(runtime);
  return runtime;
}

async function workspace() {
  const runtime = boot();
  const login = await runtime.identityAccess.authenticate({ username: "admin", password: "admin" });
  await runtime.identityAccess.upsertUser({ id: "user.lender", username: "lender", displayName: "Lender", roleId: "admin", password: "dummy-lender-password" });
  const project = await runtime.automationStudio.createProject({ name: "Checks", domainId: "example" });
  const flow = await runtime.automationStudio.createFlow({ projectId: project.id, flowId: "flow.checks", name: "Checks" });
  return { runtime, login, scope: { projectId: project.id, flowId: flow.flowId } };
}

async function grant(runtime: GlobalProgramRuntime, login: Awaited<ReturnType<typeof workspace>>["login"], scope: { projectId: string; flowId: string }, keyId: string) {
  const answer = await runtime.api.call({ programId: "automation-studio", endpoint: AUTOMATION_STUDIO_ENDPOINTS.updateFlowSettings, scope: {}, actor: actorFor(login), payload: { ...scope, flow: { metadata: {} }, resultCheckAuthorization: { keyId, maxTotalCostUsd: 1, maxCostUsdPerCall: 0.05 } } });
  expect(answer.error).toBeUndefined();
}

/** One unattended check, as the run's resolver makes it: redeem the stored grant, then release its key as the standing principal. */
async function check(runtime: GlobalProgramRuntime, scope: { projectId: string; flowId: string }): Promise<string> {
  const flow = await runtime.automationStudio.getFlow(scope.projectId, scope.flowId);
  const stored = automationStudioResultCheckAuthorizationFromMetadata((flow.metadata as { trainingModeSettings?: { resultCheck?: { authorization?: unknown } } } | undefined)?.trainingModeSettings?.resultCheck?.authorization);
  const redemption = redeemAutomationStudioResultCheckAuthorization({ authorization: stored, taskKind: "loop_verification", nowMs: Date.now(), spentUsd: 0 });
  if (!redemption.redeemed) throw new Error(`${redemption.code}: ${redemption.reason}`);
  return await revealAutomationStudioResultCheckSecret({
    ports: {
      getKeySummary: (id) => runtime.secretKeys.getKeySummary(id),
      createUseAuthorization: (input) => runtime.secretKeys.access.createUseAuthorization(input),
      revealKeyWithAuthorization: (input) => runtime.secretKeys.revealKeyWithAuthorization(input),
      revokeRevealAuthorization: (id) => runtime.secretKeys.revokeRevealAuthorization(id)
    },
    scope: { ...scope, keyId: redemption.keyId, authorizationId: redemption.authorizationId, authorizedByUserId: redemption.authorizedByUserId, purpose: "loop_verification", maxEstimatedCostUsd: redemption.maxEstimatedCostUsd },
    request: { ...scope, outboundBody: "{}" }
  });
}

describe("a Flow's result check, with nobody signed in to unlock anything", () => {
  it("gets the person's own key from the stored grant alone, after their session ends too", async () => {
    const { runtime, login, scope } = await workspace();
    const own = await runtime.secretKeys.createKey({ name: "Own", kind: "llm", provider: "Anthropic", value: OWN_VALUE, createdBy: login.user.id });
    await grant(runtime, login, scope, own.id);
    expect(await check(runtime, scope)).toBe(OWN_VALUE);
    await runtime.identityAccess.revokeSession(login.session.id);
    expect(await check(runtime, scope)).toBe(OWN_VALUE);
    expect(runtime.secretKeys.activeSessionUnlockCount()).toBe(0);
    expect(runtime.secretKeys.unlockedSessionFor(login.user.id)).toBeNull();
  });

  it("gets the workspace's lent key while it is chosen and offered, and nothing once the offer is withdrawn", async () => {
    const { runtime, login, scope } = await workspace();
    const lent = await runtime.secretKeys.createKey({ name: "Lent", kind: "llm", provider: "Anthropic", value: LENT_VALUE, createdBy: "user.lender" });
    await grant(runtime, login, scope, lent.id);
    await expect(check(runtime, scope)).rejects.toThrow("not authorized");
    await runtime.secretKeys.modelKeys.setAssistant({ keyId: lent.id, chosenBy: login.user.id });
    await expect(check(runtime, scope)).rejects.toThrow("not authorized");
    await runtime.secretKeys.modelKeys.setOffered(lent.id, true, "user.lender");
    expect(await check(runtime, scope)).toBe(LENT_VALUE);
    await runtime.secretKeys.modelKeys.setOffered(lent.id, false, "user.lender");
    await expect(check(runtime, scope)).rejects.toThrow("not authorized");
    expect(runtime.secretKeys.activeSessionUnlockCount()).toBe(0);
  });
});
