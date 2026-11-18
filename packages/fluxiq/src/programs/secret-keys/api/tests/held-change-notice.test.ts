// A write that runs a saved key's free check tells clients of its change
// once, after the check is recorded (t928, round 3): the live proof saw
// `ready` pushed at the commit and `provider_refused` about 120 ms later, so a
// key the provider refuses read ready for a moment. The notice is held for
// that write alone, given exactly once however the check ends, and never for
// a write that failed. No timer anywhere; dummy values; in-memory store.

import { describe, expect, it } from "vitest";
import type { ModelAccessState } from "@fluxiq/contracts/platform";
import { adminRole } from "../../../identity-access/index.ts";
import { GlobalProgramApiRegistry, type ProgramApiActor, type ProgramApiResponse } from "../../../_shared/api.ts";
import { actor } from "../../../_shared/tests/iam-registry-fixtures.ts";
import { SecretKeysService } from "../../runtime/service.ts";
import { WEAK_SCRYPT_PARAMETERS, createMemoryRepository, hostProtectionOptions } from "../../runtime/tests/secret-key-fixtures.ts";
import type { SecretKeysSnapshot } from "../../types.ts";
import { registerSecretKeysApi } from "../handlers.ts";

const panel = actor("alice", "admin", adminRole.permissions);

/** A check the test finishes by hand: it resolves, or rejects, when told. */
function heldCheck() {
  const events: string[] = [];
  let finish: (outcome: "resolve" | "reject") => void = () => undefined;
  let started: () => void = () => undefined;
  const begun = new Promise<void>((resolve) => { started = resolve; });
  const check = async () => {
    events.push("check started");
    started();
    const outcome = await new Promise<"resolve" | "reject">((resolve) => { finish = resolve; });
    events.push(`check ${outcome}d`);
    if (outcome === "reject") throw new Error("provider check failed");
  };
  return { events, begun, check, finish: (outcome: "resolve" | "reject") => finish(outcome) };
}

function workspace(options: { protected?: boolean } = {}) {
  const service = new SecretKeysService({ repository: createMemoryRepository().repository, passwordKdf: { testOnlyWeakParameters: WEAK_SCRYPT_PARAMETERS }, ...(options.protected === false ? {} : hostProtectionOptions()) });
  const registry = new GlobalProgramApiRegistry({ iam: { profile: "local" } });
  const held = heldCheck();
  service.onModelKeysChanged(() => { held.events.push("notice"); });
  const modelAccessOf = async (caller: ProgramApiActor, snapshot: SecretKeysSnapshot): Promise<ModelAccessState> => {
    const key = snapshot.keys.find((candidate) => candidate.kind === "llm" && candidate.enabled && candidate.createdBy === caller.userId);
    return key
      ? { status: "ready", message: "Ready.", key: { id: key.id, name: key.name, provider: "anthropic", model: "anthropic-default" }, lastCall: null }
      : { status: "no_key", message: "Add a model key.", key: null, lastCall: null };
  };
  registerSecretKeysApi(registry, service, undefined, () => ({ sessionId: null }), modelAccessOf, held.check);
  const call = (endpoint: string, payload: Record<string, unknown>) =>
    registry.call({ programId: "secret-keys", endpoint, scope: {}, actor: panel, payload }) as Promise<ProgramApiResponse<any>>;
  return { service, call, held };
}

const notices = (events: readonly string[]) => events.filter((event) => event === "notice").length;

describe("a write that runs the free check", () => {
  it.each(["resolve", "reject"] as const)("on save-model-key, notifies exactly once, only after the check is recorded (check %ss)", async (outcome) => {
    const { call, held } = workspace();
    const saving = call("save-model-key", { provider: "anthropic", value: "dummy-saved-value" });
    await held.begun;
    // The key is committed and the assistant chosen, yet nobody has been told.
    expect(notices(held.events)).toBe(0);
    held.finish(outcome);
    expect((await saving).ok).toBe(true);
    expect(held.events).toEqual(["check started", `check ${outcome}d`, "notice"]);
  });

  it.each([
    ["create-key", (_id: string) => ({ name: "Model", kind: "llm", provider: "Anthropic", value: "dummy-created-value" })],
    ["rotate-key", (id: string) => ({ id, value: "dummy-rotated-value" })],
    ["replace-model-key", (_id: string) => ({ value: "dummy-replaced-value" })]
  ] as const)("on %s, notifies exactly once, only after the check is recorded", async (endpoint, payloadOf) => {
    const { service, call, held } = workspace();
    const existing = await service.createKey({ name: "Existing", kind: "llm", provider: "Anthropic", value: "dummy-existing-value", createdBy: "alice" });
    held.events.length = 0;
    const writing = call(endpoint, payloadOf(existing.id));
    await held.begun;
    expect(notices(held.events)).toBe(0);
    held.finish("resolve");
    const answer = await writing;
    expect(answer.ok, answer.error).toBe(true);
    expect(held.events).toEqual(["check started", "check resolved", "notice"]);
  });

  it("holds only its own notice: another write meanwhile notifies at once", async () => {
    const { service, call, held } = workspace();
    const other = await service.createKey({ name: "Other", kind: "llm", provider: "Anthropic", value: "dummy-other-value", createdBy: "alice" });
    held.events.length = 0;
    const saving = call("save-model-key", { provider: "anthropic", value: "dummy-saved-value" });
    await held.begun;
    await service.deleteKey(other.id);
    expect(held.events).toEqual(["check started", "notice"]);
    held.finish("resolve");
    await saving;
    expect(held.events).toEqual(["check started", "notice", "check resolved", "notice"]);
  });

  it("gives no notice for a write that failed, and leaves no hold behind", async () => {
    const { service, call, held } = workspace({ protected: false });
    const refused = await call("save-model-key", { provider: "anthropic", value: "dummy-refused-value" });
    expect(refused).toMatchObject({ ok: false });
    expect(held.events).toEqual([]);
    // The next change, outside any write's hold, is told at once.
    await service.modelKeys.setAssistantAllowance(1);
    expect(held.events).toEqual(["notice"]);
  });
});
