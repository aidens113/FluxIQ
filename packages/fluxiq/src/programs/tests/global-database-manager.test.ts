// The database manager service and the credential recheck that gates it.

import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { DatabaseManagerService, SQLiteRepository, createRecord } from "../database-manager/index.ts";
import { createGlobalProgramRuntime } from "../index.ts";
import { actorFor } from "./login-actor.ts";

describe("global program services", () => {
  it("summarizes database repositories", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "fluxiq-programs-"));
    try {
      const repo = new SQLiteRepository({ rootDir: root, kind: "widgets" });
      const service = new DatabaseManagerService().registerRepository("widgets", repo);

      await repo.put(createRecord({ id: "alpha", kind: "widgets", data: { name: "Alpha" }, nowMs: 1000 }));

      expect((await service.snapshot()).stores[0]?.recordCount).toBe(1);
      expect((await service.snapshot()).databases).toContain("global");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("requires fresh credential recheck before database manager exposes identity records", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "fluxiq-sensitive-db-"));
    try {
      const runtime = createGlobalProgramRuntime({
        root,
        fluxiq: path.join(root, ".fluxiq"),
        config: path.join(root, ".fluxiq", "config"),
        data: path.join(root, ".fluxiq", "data"),
        databases: path.join(root, ".fluxiq", "databases"),
        inputs: path.join(root, ".fluxiq", "inputs"),
        outputs: path.join(root, ".fluxiq", "outputs"),
        streams: path.join(root, ".fluxiq", "streams"),
        domains: path.join(root, ".fluxiq", "domains"),
        domainPrograms: path.join(root, ".fluxiq", "domains", "programs"),
        domainInputs: path.join(root, ".fluxiq", "domains", "inputs"),
        domainOutputs: path.join(root, ".fluxiq", "domains", "outputs"),
        domainConfigs: path.join(root, ".fluxiq", "domains", "configs"),
        domainData: path.join(root, ".fluxiq", "domains", "data"),
        domainDatabases: path.join(root, ".fluxiq", "domains", "databases"),
        recordings: path.join(root, ".fluxiq", "recordings"),
        policies: path.join(root, ".fluxiq", "policies"),
        logs: path.join(root, ".fluxiq", "logs"),
        temp: path.join(root, ".fluxiq", "tmp")
      });
      const login = await runtime.identityAccess.authenticate({ username: "admin", password: "admin" });

      await expect(runtime.api.call({
        programId: "database-manager",
        endpoint: "list-records",
        scope: {},
        actor: actorFor(login),
        payload: { kind: "identity.users", authSessionId: login.session.id }
      })).resolves.toMatchObject({ ok: false, requiresRecheck: true });

      await expect(runtime.api.call({
        programId: "database-manager",
        endpoint: "list-records",
        scope: {},
        actor: actorFor(login),
        payload: { kind: "identity.users", authSessionId: login.session.id, authorizationPassword: "admin" }
      })).resolves.toMatchObject({ ok: true });
      const grant = await runtime.api.call({
        programId: "database-manager",
        endpoint: "authorize-store",
        scope: {},
        actor: actorFor(login),
        payload: { kind: "identity.users", authSessionId: login.session.id, authorizationPassword: "admin" }
      }) as { ok: boolean; payload?: { grantId: string; expiresAtMs: number } };
      expect(grant.ok).toBe(true);
      expect(grant.payload?.expiresAtMs).toBeGreaterThan(Date.now());
      await expect(runtime.api.call({
        programId: "database-manager",
        endpoint: "list-records",
        scope: {},
        actor: actorFor(login),
        payload: { kind: "identity.users", grantId: grant.payload?.grantId, limit: 1, offset: 0 }
      })).resolves.toMatchObject({ ok: true, payload: { limit: 1, offset: 0, records: expect.any(Array), total: expect.any(Number) } });

      await runtime.api.call({
        programId: "secret-keys",
        endpoint: "create-key",
        scope: {},
        actor: actorFor(login),
        payload: { name: "LLM", value: "sk-hidden", authSessionId: login.session.id, authorizationPassword: "admin" }
      });
      await expect(runtime.api.call({
        programId: "database-manager",
        endpoint: "list-records",
        scope: {},
        actor: actorFor(login),
        payload: { kind: "secret.keys", authSessionId: login.session.id }
      })).resolves.toMatchObject({ ok: false, requiresRecheck: true });
      await expect(runtime.api.call({
        programId: "database-manager",
        endpoint: "list-records",
        scope: {},
        actor: actorFor(login),
        payload: { kind: "secret.keys", authSessionId: login.session.id, authorizationPassword: "admin" }
      })).resolves.toMatchObject({ ok: true });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

});
