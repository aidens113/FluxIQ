import { expect, it } from "vitest";
import { observationFixture } from "../../../execution-observation/tests/fixture.ts";
import { prepareObservedExecutionCallback, type ExecutionCallbackOutcome } from "../../../execution-observation/index.ts";
import type { ModelExecutionOptions } from "../../execution/index.ts";
import { releaseAutomationStudioSessionProviderKey, type AutomationStudioSessionKeyPorts } from "../index.ts";

const key = { id: "key.unit", kind: "llm", provider: "deepseek", enabled: true, updatedAtMs: 3, createdBy: "actor.unit" };

it("fences an unsupported nested snapshot effect before any later authorization or reveal", async () => {
  const f = await observationFixture();
  let snapshotEffects = 0;
  let authorizations = 0;
  let reveals = 0;
  let unlocks = 0;
  const ports: AutomationStudioSessionKeyPorts = {
    async snapshot() {
      snapshotEffects++;
      return { keys: [key] };
    },
    async createSessionRevealAuthorization() {
      authorizations++;
      return { authorizationId: "authorization.unit", keyId: key.id, keyUpdatedAtMs: key.updatedAtMs };
    },
    async revealKeyWithAuthorization() {
      reveals++;
      return { value: "must not be revealed" };
    },
    revokeRevealAuthorization() {},
    unlockedSessionFor() {
      unlocks++;
      return "session.unit";
    }
  };
  const execution: { observation?: ModelExecutionOptions["observation"] } = {};
  const core = { run() { return releaseAutomationStudioSessionProviderKey(ports, { userId: "actor.unit", sessionId: "session.unit" }, { provider: "deepseek" }, execution); } };
  f.source.manage({ receiver: core, callback: core.run, contract: "managed_direct_effects", consumeCompletion: ({ invocation }) => f.source.frameCompletion(invocation) });
  const owned = await prepareObservedExecutionCallback(f.observation, { receiver: core, callback: core.run, args: [] });
  execution.observation = owned.observation;
  const outcome = await owned.invoke().then(value => ({ value }), error => ({ error: error as unknown }));
  expect(snapshotEffects).toBe(1);
  expect(unlocks).toBe(0);
  expect(authorizations).toBe(0);
  expect(reveals).toBe(0);
  expect(outcome).toMatchObject({ error: { message: "model.secret.completion_unknown" } });
  expect(owned.completion()).not.toBe("settled");
  await expect(f.authority.consumer.inspect(f.scope)).resolves.toMatchObject({ state: "pending" });
});

it("retains genuine completed port receipts and their original receivers and tuples", async () => {
  const f = await observationFixture();
  const completed = new WeakSet<object>();
  let authorizations = 0;
  let reveals = 0;
  const ports: AutomationStudioSessionKeyPorts = {
    async snapshot() { return { keys: [key] }; },
    createSessionRevealAuthorization(input) {
      expect(this).toBe(ports);
      expect(input).toEqual({ id: key.id, sessionId: "session.unit", userId: "actor.unit", ttlMs: 10000 });
      const original = Promise.resolve().then(() => {
        authorizations++;
        completed.add(original);
        return { authorizationId: "authorization.unit", keyId: key.id, keyUpdatedAtMs: key.updatedAtMs };
      });
      return original;
    },
    revealKeyWithAuthorization(input) {
      expect(this).toBe(ports);
      expect(input).toEqual({ authorizationId: "authorization.unit", id: key.id });
      const original = Promise.resolve().then(() => {
        reveals++;
        completed.add(original);
        return { value: "unit-owned-value" };
      });
      return original;
    },
    revokeRevealAuthorization() {}
  };
  const consume = (input: { returned?: unknown; outcome: ExecutionCallbackOutcome<unknown> }) => input.outcome.kind === "fulfilled" && input.returned !== null && typeof input.returned === "object" && completed.has(input.returned)
    ? { disposition: "settled" as const, completionDigest: "secret.actual.port.ack", assessmentDigest: "secret.original.promise" }
    : { disposition: "unknown" as const, code: "secret.port.unverified" };
  f.source.manage({ receiver: ports, callback: ports.snapshot, contract: "no_direct_effects" });
  f.source.manage({ receiver: ports, callback: ports.createSessionRevealAuthorization, contract: "managed_direct_effects", consumeCompletion: consume });
  f.source.manage({ receiver: ports, callback: ports.revealKeyWithAuthorization, contract: "managed_direct_effects", consumeCompletion: consume });
  const execution: { observation?: ModelExecutionOptions["observation"] } = {};
  const core = { run() { return releaseAutomationStudioSessionProviderKey(ports, { userId: "actor.unit", sessionId: "session.unit" }, { provider: "deepseek" }, execution); } };
  f.source.manage({ receiver: core, callback: core.run, contract: "managed_direct_effects", consumeCompletion: ({ invocation }) => f.source.frameCompletion(invocation, f.source.owner) });
  const owned = await prepareObservedExecutionCallback(f.observation, { receiver: core, callback: core.run, args: [] });
  execution.observation = owned.observation;
  await expect(owned.invoke()).resolves.toBe("unit-owned-value");
  expect(authorizations).toBe(1);
  expect(reveals).toBe(1);
  expect(owned.completion()).toBe("settled");
});
