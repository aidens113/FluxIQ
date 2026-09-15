import { describe, expect, it } from "vitest";
import { GlobalProgramApiRegistry, type ProgramApiActor } from "../../../_shared/api.ts";
import { IdentityAccessService } from "../../../identity-access/index.ts";
import {
  DATABASE_MANAGER_ENDPOINTS,
  DatabaseManagerService,
  registerDatabaseManagerApi,
  type RecordEnvelope,
  type Repository,
  type RepositoryScope
} from "../../index.ts";

// The in-memory Identity Access service seeds a default "admin" account with this password.
// It is a built-in development default, not a real credential.
const DEFAULT_ADMIN_PASSWORD = "admin";
const WRONG_PASSWORD = "not-the-admin-password";
const SENSITIVE_STORES = ["identity.users", "secret.keys"] as const;
const ORDINARY_STORE = "widgets";
const RECORD_ID = "record.one";

type Operation = "put" | "delete";
type Credentials = { authSessionId?: string; authorizationPassword?: string; grantId?: string };
type WriteLog = { puts: string[]; deletes: string[] };

describe("database manager record writes", () => {
  const cases = SENSITIVE_STORES.flatMap((kind) => (["put", "delete"] as const).map((operation) => ({ kind, operation })));

  describe.each(cases)("$operation-record on the sensitive $kind store", ({ kind, operation }) => {
    it("is refused without credentials, in the same shape as a read", async () => {
      const harness = await createHarness();

      const write = await harness.write(operation, kind, {});
      const read = await harness.read(kind, {});

      expect(write).toEqual({ ok: false, requiresRecheck: true, error: "Authentication required" });
      expect(write).toEqual(read);
      expect(harness.log).toEqual({ puts: [], deletes: [] });
    });

    it("is refused with a session but no password, in the same shape as a read", async () => {
      const harness = await createHarness();
      const credentials = { authSessionId: harness.sessionId };

      const write = await harness.write(operation, kind, credentials);
      const read = await harness.read(kind, credentials);

      expect(write).toMatchObject({ ok: false, requiresRecheck: true, error: expect.any(String) });
      expect(write).toEqual(read);
      expect(harness.log).toEqual({ puts: [], deletes: [] });
    });

    it("is refused with a wrong password, in the same shape as a read", async () => {
      const harness = await createHarness();
      const credentials = { authSessionId: harness.sessionId, authorizationPassword: WRONG_PASSWORD };

      const write = await harness.write(operation, kind, credentials);
      const read = await harness.read(kind, credentials);

      expect(write).toEqual({ ok: false, requiresRecheck: true, error: "Invalid username or credentials" });
      expect(write).toEqual(read);
      expect(harness.log).toEqual({ puts: [], deletes: [] });
    });

    it("is allowed with the session's correct credentials", async () => {
      const harness = await createHarness();

      const write = await harness.write(operation, kind, { authSessionId: harness.sessionId, authorizationPassword: DEFAULT_ADMIN_PASSWORD });

      expect(write.ok).toBe(true);
      if (operation === "put") {
        expect(write.payload).toMatchObject({ id: RECORD_ID, data: { note: "changed" } });
        expect(harness.log).toEqual({ puts: ["global:" + RECORD_ID], deletes: [] });
      } else {
        expect(write.payload).toEqual({ deleted: true });
        expect(harness.log).toEqual({ puts: [], deletes: ["global:" + RECORD_ID] });
      }
    });
  });

  it("leaves put-record and delete-record on a non-sensitive store unchanged", async () => {
    const harness = await createHarness();

    const put = await harness.write("put", ORDINARY_STORE, {});
    const deleted = await harness.write("delete", ORDINARY_STORE, {});

    expect(put).toMatchObject({ ok: true, payload: { id: RECORD_ID, data: { note: "changed" } } });
    expect(deleted).toEqual({ ok: true, payload: { deleted: true } });
    expect(harness.log).toEqual({ puts: ["global:" + RECORD_ID], deletes: ["global:" + RECORD_ID] });
  });

  it("accepts a store grant for writes only on the store and scope it was issued for", async () => {
    const harness = await createHarness();
    const grantId = await harness.issueGrant("secret.keys", {});

    await expect(harness.write("put", "secret.keys", { grantId }, { payloadScope: {} })).resolves.toMatchObject({ ok: true });
    await expect(harness.write("put", "identity.users", { grantId }, { payloadScope: {} })).resolves.toMatchObject({ ok: false, requiresRecheck: true });
    // With no payload scope the write acts on the request's domain scope, which the global grant does not cover.
    await expect(harness.write("delete", "secret.keys", { grantId }, { requestScope: { domainId: "example" } })).resolves.toMatchObject({ ok: false, requiresRecheck: true });
    expect(harness.log).toEqual({ puts: ["global:" + RECORD_ID], deletes: [] });
  });

  it("does not renew a store grant without a fresh credential recheck", async () => {
    const harness = await createHarness();
    const grantId = await harness.issueGrant("secret.keys", {});

    const renewal = await harness.call(DATABASE_MANAGER_ENDPOINTS.authorizeStore, { kind: "secret.keys", scope: {}, grantId });

    expect(renewal).toEqual({ ok: false, requiresRecheck: true, error: "Authentication required" });
  });
});

async function createHarness() {
  const identityAccess = new IdentityAccessService();
  const login = await identityAccess.authenticate({ username: "admin", password: DEFAULT_ADMIN_PASSWORD });
  const log: WriteLog = { puts: [], deletes: [] };
  const service = new DatabaseManagerService();
  for (const kind of [...SENSITIVE_STORES, ORDINARY_STORE]) {
    service.registerRepository(kind, memoryRepository(log));
    await service.putRecord(kind, RECORD_ID, { note: "seeded" });
  }
  log.puts.length = 0;
  const registry = new GlobalProgramApiRegistry();
  registerDatabaseManagerApi(registry, service, identityAccess);
  const actor: ProgramApiActor = {
    sessionId: login.session.id,
    userId: login.user.id,
    roleId: login.user.roleId,
    permissions: ["programs.read", "data.manage"]
  };
  const call = (endpoint: string, payload: Record<string, unknown>, scope: RepositoryScope = {}) =>
    registry.call({ programId: "database-manager", endpoint, scope, payload, actor });
  return {
    sessionId: login.session.id,
    log,
    call,
    read: (kind: string, credentials: Credentials) => call(DATABASE_MANAGER_ENDPOINTS.getRecord, { kind, id: RECORD_ID, ...credentials }),
    write: (operation: Operation, kind: string, credentials: Credentials, scopes: { payloadScope?: RepositoryScope; requestScope?: RepositoryScope } = {}) => {
      const target = { kind, id: RECORD_ID, ...(scopes.payloadScope ? { scope: scopes.payloadScope } : {}), ...credentials };
      return operation === "put"
        ? call(DATABASE_MANAGER_ENDPOINTS.putRecord, { ...target, data: { note: "changed" } }, scopes.requestScope)
        : call(DATABASE_MANAGER_ENDPOINTS.deleteRecord, target, scopes.requestScope);
    },
    issueGrant: async (kind: string, scope: RepositoryScope): Promise<string> => {
      const issued = await call(DATABASE_MANAGER_ENDPOINTS.authorizeStore, { kind, scope, authSessionId: login.session.id, authorizationPassword: DEFAULT_ADMIN_PASSWORD });
      const grantId = (issued.payload as { grantId?: unknown } | undefined)?.grantId;
      if (!issued.ok || typeof grantId !== "string") throw new Error("Store grant was not issued: " + String(issued.error));
      return grantId;
    }
  };
}

function memoryRepository(log: WriteLog): Repository {
  const records = new Map<string, RecordEnvelope>();
  const keyOf = (id: string, scope?: RepositoryScope) => (scope?.domainId ?? "global") + ":" + id;
  return {
    list: async () => [...records.values()],
    get: async (id, scope) => records.get(keyOf(id, scope)) ?? null,
    put: async (record) => {
      log.puts.push(keyOf(record.id, record.scope));
      records.set(keyOf(record.id, record.scope), record);
      return record;
    },
    delete: async (id, scope) => {
      log.deletes.push(keyOf(id, scope));
      return records.delete(keyOf(id, scope));
    }
  };
}
