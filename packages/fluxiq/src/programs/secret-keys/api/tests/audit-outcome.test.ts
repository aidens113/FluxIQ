// Activity says a key was saved, replaced or removed only when it was (t928):
// each key write opts in to `auditOutcome`, so the audit holds, beside the
// decision, what the handler actually did. A refused save records a failed
// outcome and never a succeeded one; a save that lands records it once. The
// value never reaches the audit.

import { describe, expect, it } from "vitest";
import { adminRole } from "../../../identity-access/index.ts";
import type { ModelAccessState } from "@fluxiq/contracts/platform";
import { GlobalProgramApiRegistry, type ProgramApiActor, type ProgramApiResponse } from "../../../_shared/api.ts";
import { actor, recordingSink } from "../../../_shared/tests/iam-registry-fixtures.ts";
import { SecretKeysService } from "../../runtime/service.ts";
import { WEAK_SCRYPT_PARAMETERS, createMemoryRepository, hostProtectionOptions } from "../../runtime/tests/secret-key-fixtures.ts";
import type { SecretKeysSnapshot } from "../../types.ts";
import { registerSecretKeysApi } from "../handlers.ts";
import { scriptedKeyCheck } from "./scripted-key-check.ts";

const VALUE = "dummy-audit-value-1234";
const panel = actor("alice", "admin", adminRole.permissions);

function workspace(options: { hostProtection: boolean }) {
  const service = new SecretKeysService({ repository: createMemoryRepository().repository, passwordKdf: { testOnlyWeakParameters: WEAK_SCRYPT_PARAMETERS }, ...(options.hostProtection ? hostProtectionOptions() : {}) });
  const audit = recordingSink();
  const registry = new GlobalProgramApiRegistry({ iam: { profile: "local", audit } });
  // The host's reading, reduced to what these writes need: the caller's own newest model key.
  const modelAccessOf = async (caller: ProgramApiActor, snapshot: SecretKeysSnapshot): Promise<ModelAccessState> => {
    const key = snapshot.keys.filter((candidate) => candidate.kind === "llm" && candidate.enabled && candidate.createdBy === caller.userId)[0];
    if (!key) return { status: "no_key", message: "Add a model key.", key: null, lastCall: null };
    return { status: "ready", message: "Ready.", key: { id: key.id, name: key.name, provider: "anthropic", model: "anthropic-default" }, lastCall: null };
  };
  const scripted = scriptedKeyCheck();
  registerSecretKeysApi(registry, service, undefined, () => ({ sessionId: null }), modelAccessOf, scripted.check);
  const call = (endpoint: string, payload: Record<string, unknown>) =>
    registry.call({ programId: "secret-keys", endpoint, scope: {}, actor: panel, payload }) as Promise<ProgramApiResponse>;
  const outcomes = () => audit.records.filter((record) => record.outcome !== undefined).map((record) => record.outcome);
  return { service, audit, call, outcomes, scripted };
}

describe("key writes audit their real outcome", () => {
  it("a save that fails records a failed outcome and never a succeeded one", async () => {
    const { service, audit, call, outcomes } = workspace({ hostProtection: false });
    const answer = await call("save-model-key", { provider: "anthropic", value: VALUE });
    expect(answer.ok).toBe(false);
    expect(outcomes()).toEqual([expect.objectContaining({ result: "failed" })]);
    expect(JSON.stringify(audit.records)).not.toContain(VALUE);
    service.close();
  });

  it("a save, a replace and a remove that land each record one succeeded outcome", async () => {
    const { service, audit, call, outcomes } = workspace({ hostProtection: true });
    expect((await call("save-model-key", { provider: "anthropic", value: VALUE })).ok).toBe(true);
    expect(outcomes()).toEqual([{ result: "succeeded" }]);
    expect((await call("replace-model-key", { value: `${VALUE}-next` })).ok).toBe(true);
    expect((await call("remove-model-key", {})).ok).toBe(true);
    expect(outcomes()).toEqual([{ result: "succeeded" }, { result: "succeeded" }, { result: "succeeded" }]);
    expect(JSON.stringify(audit.records)).not.toContain(VALUE);
    service.close();
  });

  it("create-key, rotate-key and delete-key record their outcome too", async () => {
    const { service, call, outcomes } = workspace({ hostProtection: true });
    const created = await call("create-key", { name: "Spare", value: VALUE, kind: "llm", provider: "anthropic" });
    expect(created.ok).toBe(true);
    const id = (created as { payload?: { id?: string } }).payload?.id;
    expect((await call("rotate-key", { id: "secret:missing", value: VALUE })).ok).toBe(false);
    expect((await call("delete-key", { id })).ok).toBe(true);
    expect(outcomes().map((outcome) => outcome?.result)).toEqual(["succeeded", "failed", "succeeded"]);
    service.close();
  });

  // t950: the provider's verdict, not the store step, decides what Activity reads. Refused and no-credit writes stored
  // nothing and record a failed outcome with that kind; an unreachable provider still lets the key be saved.
  it.each([
    ["provider_refused", { result: "failed", errorKind: "provider_refused" }],
    ["no_credit", { result: "failed", errorKind: "no_credit" }],
    ["provider_unreachable", { result: "succeeded" }],
    ["answered", { result: "succeeded" }]
  ] as const)("records the provider's verdict %s as the outcome of save, replace, create and rotate", async (verdict, expected) => {
    const { service, call, outcomes, scripted } = workspace({ hostProtection: true });
    // A key the provider took, for replace and rotate to act on.
    expect((await call("save-model-key", { provider: "anthropic", value: VALUE })).ok).toBe(true);
    const id = (await service.snapshot()).keys[0]!.id;
    scripted.answer({ outcome: verdict });
    await call("save-model-key", { provider: "anthropic", value: `${VALUE}-2` });
    await call("replace-model-key", { value: `${VALUE}-3` });
    await call("create-key", { name: "Spare", value: `${VALUE}-4`, kind: "llm", provider: "anthropic" });
    await call("rotate-key", { id, value: `${VALUE}-5` });
    expect(outcomes().slice(1)).toEqual([expected, expected, expected, expected]);
    service.close();
  });
});
