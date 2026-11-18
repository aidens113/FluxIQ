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
  registerSecretKeysApi(registry, service, undefined, () => ({ sessionId: null }), modelAccessOf, async () => undefined);
  const call = (endpoint: string, payload: Record<string, unknown>) =>
    registry.call({ programId: "secret-keys", endpoint, scope: {}, actor: panel, payload }) as Promise<ProgramApiResponse>;
  const outcomes = () => audit.records.filter((record) => record.outcome !== undefined).map((record) => record.outcome);
  return { service, audit, call, outcomes };
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
});
