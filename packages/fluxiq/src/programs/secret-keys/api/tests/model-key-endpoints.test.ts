// The default-key and assistant-model endpoints, called as a signed-in person.
import { describe, expect, it } from "vitest";
import { createGlobalProgramRuntime } from "../../../index.ts";
import { actorFor } from "../../../tests/login-actor.ts";

type Answer = { ok: boolean; payload?: Record<string, unknown>; error?: string };

async function setup() {
  const runtime = createGlobalProgramRuntime();
  const login = await runtime.identityAccess.authenticate({ username: "admin", password: "admin" });
  const call = (endpoint: string, payload: Record<string, unknown> = {}) =>
    runtime.api.call({ programId: "secret-keys", endpoint, scope: {}, actor: actorFor(login), payload }) as Promise<Answer>;
  const add = (name: string) => runtime.secretKeys.createKey({ name, value: `dummy-${name}`, authorizationPassword: "admin", provider: "alpha", createdBy: login.user.id });
  return { runtime, call, add };
}

describe("model key endpoints", () => {
  it("set-default-key changes the default, and get-assistant-model reads it", async () => {
    const { runtime, call, add } = await setup();
    const first = await add("First");
    const second = await add("Second");
    expect((await call("get-assistant-model")).payload).toMatchObject({ defaultKeyId: first.id, assistantKeyId: null });
    const set = await call("set-default-key", { id: second.id });
    expect(set.ok, set.error).toBe(true);
    expect(set.payload).toMatchObject({ defaultKeyId: second.id });
    runtime.secretKeys.close();
  });

  it("set-default-key and set-assistant-model refuse a missing key in plain words", async () => {
    const { runtime, call, add } = await setup();
    await add("First");
    expect(await call("set-default-key", { id: "secret:nope" })).toMatchObject({ ok: false });
    expect(await call("set-default-key", {})).toMatchObject({ ok: false });
    expect(await call("set-assistant-model", { keyId: "secret:nope" })).toMatchObject({ ok: false, error: "That key does not exist." });
    runtime.secretKeys.close();
  });

  it("set-assistant-model accepts its minimal example and a key with a model", async () => {
    const { runtime, call, add } = await setup();
    const first = await add("First");
    const empty = await call("set-assistant-model", {});
    expect(empty.ok, empty.error).toBe(true);
    const chosen = await call("set-assistant-model", { keyId: first.id, model: "some-model" });
    expect(chosen.payload).toMatchObject({ assistantKeyId: first.id, assistantModel: "some-model" });
    runtime.secretKeys.close();
  });
});
