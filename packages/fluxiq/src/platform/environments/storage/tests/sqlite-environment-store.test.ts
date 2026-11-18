// @fluxiq-test-group real-sql
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import type { EnvironmentIntent } from "../../model/index.ts";
import { SQLiteEnvironmentStore } from "../index.ts";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function store(): Promise<{ rootDir: string; store: SQLiteEnvironmentStore }> {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "fluxiq-environment-store-"));
  roots.push(rootDir);
  return { rootDir, store: new SQLiteEnvironmentStore({ rootDir, now: () => 2_000 }) };
}

function intent(kind: EnvironmentIntent["kind"], operationId: string, overrides: Partial<EnvironmentIntent> = {}): EnvironmentIntent {
  return { operationId, environmentId: "env/a", kind, accountId: "account-a", workspaceId: "workspace-a", driver: "fake", ...overrides };
}

it("records intents with the operation ledger and indexes, durably across reopen", async () => {
  const { rootDir, store: first } = await store();
  expect(await first.recordIntent(intent("create", "op-1"))).toMatchObject({ replayed: false, record: { desired: "running", observed: "absent" } });
  const reopened = new SQLiteEnvironmentStore({ rootDir });
  expect(await reopened.recordIntent(intent("create", "op-1"))).toMatchObject({ replayed: true, record: { operationId: "op-1" } });
  await expect(reopened.recordIntent(intent("stop", "op-1"))).rejects.toMatchObject({ code: "operation-reused" });
  expect(await reopened.listByAccount("account-a")).toHaveLength(1);
  expect(await reopened.listByWorkspace("workspace-a")).toHaveLength(1);
  expect(await reopened.listByAccount("account")).toEqual([]);
  expect(await reopened.listAll()).toHaveLength(1);
});

it("writes an observation only under the record's current operation", async () => {
  const { store: environments } = await store();
  await environments.recordIntent(intent("create", "op-1"));
  expect(await environments.observe("env/a", "op-1", "running")).toMatchObject({ observed: "running" });
  await environments.recordIntent(intent("stop", "op-2"));
  expect(await environments.observe("env/a", "op-1", "crashed")).toMatchObject({ observed: "running", operationId: "op-2" });
  expect(await environments.observe("env/a", "op-2", "stopped")).toMatchObject({ observed: "stopped", desired: "stopped" });
  expect(await environments.observe("env/missing", "op-1", "running")).toBeNull();
});

it("purges the record, its operations and its index rows", async () => {
  const { store: environments } = await store();
  await environments.recordIntent(intent("create", "op-1"));
  await environments.recordIntent(intent("create", "op-1", { environmentId: "env/b" }));
  expect(await environments.purge("env/a")).toBe(true);
  expect(await environments.purge("env/a")).toBe(false);
  expect(await environments.get("env/a")).toBeNull();
  expect((await environments.listByAccount("account-a")).map((record) => record.environmentId)).toEqual(["env/b"]);
  // The operation ledger went with it: the same id is a new operation, not a replay.
  expect(await environments.recordIntent(intent("create", "op-1"))).toMatchObject({ replayed: false });
});
