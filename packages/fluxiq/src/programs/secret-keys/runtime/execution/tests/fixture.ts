import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sqlite3 from "sqlite3";
import { afterEach, vi } from "vitest";
import { SQLiteRepository } from "../../../../../framework/persistence/sqlite/index.ts";
import { createSQLiteRepositoryExecutionPorts } from "../../../../../framework/persistence/sqlite/execution/index.ts";
import { observationFixture } from "../../../../../runtime/execution-observation/tests/fixture.ts";
import { ExecutionCallbackPolicies, prepareObservedExecutionCallback } from "../../../../../runtime/execution-observation/index.ts";
import { releaseAutomationStudioSessionProviderKey } from "../../../../../runtime/models/secrets/index.ts";
import type { ModelExecutionOptions } from "../../../../../runtime/models/execution/index.ts";
import { SecretKeysService } from "../../service.ts";
import { HeldKeys } from "../../held-keys.ts";
import type { SecretKeyStore } from "../../key-store.ts";
import { createSecretKeysExecutionPorts } from "../index.ts";

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  vi.restoreAllMocks();
  const failures: unknown[] = [];
  for (const cleanup of cleanups.splice(0).reverse()) {
    try { await cleanup(); }
    catch (error) { failures.push(error); }
  }
  if (failures.length) throw new AggregateError(failures, "Native secret fixture cleanup failed.");
});

export async function nativeSecretFixture(options: { now?: (() => number) | undefined; declareClock?: boolean; seed?: boolean } = {}) {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "native-secret-owned-"));
  const repository = new SQLiteRepository({ rootDir, kind: SecretKeysService.storeKind });
  const repositoryExecution = createSQLiteRepositoryExecutionPorts(repository);
  const heldKeys = new HeldKeys();
  const service = new SecretKeysService({ repository, repositoryExecution, heldKeys, passwordKdf: { testOnlyWeakParameters: { N: 1024, r: 8, p: 1, keyLength: 32 } }, ...(options.now ? { now: options.now } : {}) });
  if (options.now && options.declareClock !== false) ExecutionCallbackPolicies.remember(service, options.now, "pure");
  const f = await observationFixture();
  const native = createSecretKeysExecutionPorts(service);
  const store = Object.getOwnPropertyDescriptor(service, "store")?.value as SecretKeyStore;
  if (!store) throw new Error("Original test service store is unavailable.");
  let released = false;
  const release = async () => {
    if (released) return;
    released = true;
    await f.authority.consumer.release(f.reserved.reservation);
  };
  cleanups.push(async () => {
    try { await release(); }
    finally {
      heldKeys.revokeAll();
      if (path.dirname(rootDir) !== os.tmpdir() || !path.basename(rootDir).startsWith("native-secret-owned-")) throw new Error("Invalid native fixture cleanup path.");
      await rm(rootDir, { recursive: true, force: true });
    }
  });
  const now = options.now ? options.now() : Date.now();
  const key = options.seed === false ? undefined : await service.createKey({ name: "Owned unit key", value: "unit-native-owned-value", provider: "deepseek", createdBy: "actor.unit", authorizationPassword: "unit-password", nowMs: now });
  if (key) await service.unlockSession({ sessionId: "session.unit", userId: "actor.unit", authorizationPassword: "unit-password", expiresAtMs: now + 60_000, nowMs: now });
  let sends = 0;
  const model = async (actorSession = "session.unit") => {
    const execution: { observation?: ModelExecutionOptions["observation"] } = {};
    const actual = { async run() {
      const value = await releaseAutomationStudioSessionProviderKey(service, { userId: "actor.unit", sessionId: actorSession }, { provider: "deepseek" }, execution, native);
      sends++;
      return value;
    } };
    f.source.manage({ receiver: actual, callback: actual.run, contract: "managed_direct_effects", consumeCompletion: ({ invocation }) => f.source.frameCompletion(invocation, f.source.owner) });
    const owned = await prepareObservedExecutionCallback(f.observation, { receiver: actual, callback: actual.run, args: [] });
    execution.observation = owned.observation;
    return owned;
  };
  const finish = async () => {
    await f.source.flush();
    await f.rootPorts.producer.finish(f.reserved.root, f.root.complete(f.origin));
    await release();
    return await f.authority.consumer.inspect(f.scope);
  };
  const lock = async () => {
    const db = await new Promise<sqlite3.Database>((resolve, reject) => {
      const original = new sqlite3.Database(path.join(rootDir, "global.sqlite"), error => error ? reject(error) : resolve(original));
    });
    const run = async (sql: string) => await new Promise<void>((resolve, reject) => { db.run(sql, error => error ? reject(error) : resolve()); });
    await run("begin immediate");
    let active = true;
    const unlock = async () => {
      if (!active) return;
      active = false;
      try { await run("commit"); }
      finally { await new Promise<void>((resolve, reject) => { db.close(error => error ? reject(error) : resolve()); }); }
    };
    cleanups.push(unlock);
    return unlock;
  };
  return { ...f, history: f.store, repository, repositoryExecution, service, native, heldKeys, store, key, model, sends: () => sends, finish, release, lock };
}
