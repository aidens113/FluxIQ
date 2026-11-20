// A write that runs a saved key's free check tells clients of its change
// once, after the check is recorded (t928, round 3): the live proof saw
// `ready` pushed at the commit and `provider_refused` about 120 ms later, so a
// key the provider refuses read ready for a moment. Since t950 the provider is
// asked BEFORE anything is stored: while it is asked the key does not exist
// and nobody is told; then the store, the recorded verdict and exactly one
// notice. A refused key is never stored and gives no notice. No timer
// anywhere; dummy values; in-memory store.

import { describe, expect, it } from "vitest";
import type { ModelAccessState } from "@fluxiq/contracts/platform";
import { adminRole } from "../../../identity-access/index.ts";
import { GlobalProgramApiRegistry, type ProgramApiActor, type ProgramApiResponse } from "../../../_shared/api.ts";
import { actor } from "../../../_shared/tests/iam-registry-fixtures.ts";
import { SecretKeysService } from "../../runtime/service.ts";
import { WEAK_SCRYPT_PARAMETERS, createMemoryRepository, hostProtectionOptions } from "../../runtime/tests/secret-key-fixtures.ts";
import type { SecretKeysSnapshot } from "../../types.ts";
import { registerSecretKeysApi } from "../handlers.ts";
import type { SecretKeySavedKeyCheck } from "../saved-key-check.ts";

const panel = actor("alice", "admin", adminRole.permissions);

/** A check the test finishes by hand: its probe answers, or rejects, when told; `record` notes the verdict kept. */
function heldCheck() {
  const events: string[] = [];
  let finish: (outcome: "resolve" | "reject" | "refuse") => void = () => undefined;
  let started: () => void = () => undefined;
  const begun = new Promise<void>((resolve) => { started = resolve; });
  const check: SecretKeySavedKeyCheck = {
    probe: async () => {
      events.push("check started");
      started();
      const outcome = await new Promise<"resolve" | "reject" | "refuse">((resolve) => { finish = resolve; });
      events.push(`check ${outcome}d`);
      if (outcome === "reject") throw new Error("provider check failed");
      return outcome === "refuse" ? { outcome: "provider_refused" } : { outcome: "answered" };
    },
    record: (_key, verdict) => { events.push(`recorded ${verdict.outcome}`); }
  };
  return { events, begun, check, finish: (outcome: "resolve" | "reject" | "refuse") => finish(outcome) };
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
  it.each([
    ["resolve", "answered"],
    ["reject", "provider_unreachable"]
  ] as const)("on save-model-key, asks before storing, then notifies exactly once after the verdict is recorded (check %ss)", async (outcome, recorded) => {
    const { service, call, held } = workspace();
    const saving = call("save-model-key", { provider: "anthropic", value: "dummy-saved-value" });
    await held.begun;
    // While the provider is asked, nothing is stored and nobody has been told.
    expect((await service.snapshot()).keys).toEqual([]);
    expect(notices(held.events)).toBe(0);
    held.finish(outcome);
    expect((await saving).ok).toBe(true);
    expect(held.events).toEqual(["check started", `check ${outcome}d`, `recorded ${recorded}`, "notice"]);
  });

  it("stores nothing and tells nobody when the provider refuses the key", async () => {
    const { service, call, held } = workspace();
    const saving = call("save-model-key", { provider: "anthropic", value: "dummy-refused-value" });
    await held.begun;
    held.finish("refuse");
    expect(await saving).toMatchObject({ ok: false, errorCode: "provider_refused" });
    expect(held.events).toEqual(["check started", "check refused"]);
    expect((await service.snapshot()).keys).toEqual([]);
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
    expect(held.events).toEqual(["check started", "check resolved", "recorded answered", "notice"]);
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
    expect(held.events).toEqual(["check started", "notice", "check resolved", "recorded answered", "notice"]);
  });

  it("gives no notice for a write that failed, and leaves no hold behind", async () => {
    const { service, call, held } = workspace({ protected: false });
    const saving = call("save-model-key", { provider: "anthropic", value: "dummy-unstorable-value" });
    await held.begun;
    held.finish("resolve");
    // The provider took it, but this store cannot keep it: the write fails after the check, and nobody is told.
    expect(await saving).toMatchObject({ ok: false });
    expect(held.events).toEqual(["check started", "check resolved"]);
    held.events.length = 0;
    // The next change, outside any write's hold, is told at once.
    await service.modelKeys.setAssistantAllowance(1);
    expect(held.events).toEqual(["notice"]);
  });
});
