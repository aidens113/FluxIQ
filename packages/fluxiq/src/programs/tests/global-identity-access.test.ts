// The identity access service: users, sessions, credentials, PIN authorization, and two-factor authentication.

import { mkdtemp, rm } from "node:fs/promises";
import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { SQLiteRepository, createRecord } from "../database-manager/index.ts";
import { IdentityAccessService, TotpRequiredError } from "../identity-access/index.ts";
import { createGlobalProgramRuntime } from "../index.ts";
import { actorFor } from "./login-actor.ts";
import { testTotpCode } from "./totp-code.ts";

describe("global program services", () => {
  it("manages identity users and sessions", async () => {
    const service = new IdentityAccessService();
    const user = (await service.snapshot(1000)).users.find((item) => item.id === "admin");

    expect(user?.username).toBe("admin");
    const session = await service.createSession(user?.id ?? "", undefined, 1000);

    expect(session.expiresAtMs).toBe(1000 + 12 * 60 * 60 * 1000);
    expect((await service.snapshot(1000)).sessions).toHaveLength(1);
  });

  it("protects the final enabled administrator", async () => {
    const service = new IdentityAccessService();

    await expect(service.updateUser({ id: "admin", enabled: false })).rejects.toThrow("At least one enabled administrator is required");
    await expect(service.updateUser({ id: "admin", roleId: "viewer" })).rejects.toThrow("At least one enabled administrator is required");

    await service.upsertUser({ id: "admin.two", username: "admin-two", displayName: "Second Admin", roleId: "admin", enabled: true });
    await expect(service.updateUser({ id: "admin", enabled: false })).resolves.toMatchObject({ enabled: false });
  });

  it("authenticates the default admin and verifies privileged credentials", async () => {
    const service = new IdentityAccessService();
    const login = await service.authenticate({ username: "admin", password: "admin" });

    expect(login.user.roleId).toBe("admin");
    expect(await service.validateSession(login.session.id)).not.toBeNull();
    await expect(service.authorizeSessionCredentials({
      sessionId: login.session.id,
      password: "admin",
      pin: undefined,
      totp: undefined
    })).resolves.toMatchObject({ username: "admin" });
    await expect(service.authorizeSessionCredentials({
      sessionId: login.session.id,
      password: "wrong",
      pin: undefined,
      totp: undefined
    })).rejects.toThrow("Invalid username or credentials");
  });

  it("requires PIN for credential rotation only after a PIN is configured", async () => {
    const service = new IdentityAccessService();
    const login = await service.authenticate({ username: "admin", password: "admin" });

    await expect(service.setPasswordAuthorized({
      userId: "admin",
      password: "changed-password",
      sessionId: login.session.id,
      authorizationPassword: "admin",
      authorizationPin: undefined,
      authorizationTotp: undefined
    })).resolves.toMatchObject({ userId: "admin" });

    const changedLogin = await service.authenticate({ username: "admin", password: "changed-password" });
    await service.setPinAuthorized({
      userId: "admin",
      pin: "1234",
      sessionId: changedLogin.session.id,
      authorizationPassword: "changed-password",
      authorizationPin: undefined,
      authorizationTotp: undefined
    });

    await expect(service.setPasswordAuthorized({
      userId: "admin",
      password: "blocked-password",
      sessionId: changedLogin.session.id,
      authorizationPassword: "changed-password",
      authorizationPin: "0000",
      authorizationTotp: undefined
    })).rejects.toThrow("Invalid username or credentials");

    await expect(service.authenticate({ username: "admin", password: "changed-password" })).resolves.toMatchObject({
      user: { id: "admin" }
    });
  });

  it("requires the global user PIN for Automation Studio project organization changes", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "fluxiq-automation-pin-"));
    try {
      const paths = {
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
      };
      const runtime = createGlobalProgramRuntime(paths);
      const login = await runtime.identityAccess.authenticate({ username: "admin", password: "admin" });
      await runtime.identityAccess.setPinAuthorized({
        userId: "admin",
        pin: "1234",
        sessionId: login.session.id,
        authorizationPassword: "admin",
        authorizationPin: undefined,
        authorizationTotp: undefined
      });
      const reloadedRuntime = createGlobalProgramRuntime(paths);

      await expect(reloadedRuntime.api.call({
        programId: "automation-studio",
        endpoint: "create-project-category",
        scope: {},
        actor: actorFor(login),
        payload: { name: "Blocked", authSessionId: login.session.id, authorizationPin: "0000" }
      })).resolves.toMatchObject({ ok: false, error: "Invalid PIN" });

      const first = await reloadedRuntime.api.call<{ name: string; authSessionId: string; authorizationPin: string }, { category: { id: string; name: string; order: number } }>({
        programId: "automation-studio",
        endpoint: "create-project-category",
        scope: {},
        actor: actorFor(login),
        payload: { name: "First", authSessionId: login.session.id, authorizationPin: "1234" }
      });
      const second = await reloadedRuntime.api.call<{ name: string; authSessionId: string; authorizationPin: string }, { category: { id: string; name: string; order: number } }>({
        programId: "automation-studio",
        endpoint: "create-project-category",
        scope: {},
        actor: actorFor(login),
        payload: { name: "Second", authSessionId: login.session.id, authorizationPin: "1234" }
      });

      const firstId = first.payload?.category.id ?? "";
      const secondId = second.payload?.category.id ?? "";
      await expect(reloadedRuntime.api.call({
        programId: "automation-studio",
        endpoint: "reorder-project-categories",
        scope: {},
        actor: actorFor(login),
        payload: { categoryIds: [secondId, firstId], authSessionId: login.session.id, authorizationPin: "1234" }
      })).resolves.toMatchObject({ ok: true, payload: { categories: [{ id: secondId }, { id: firstId }] } });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("upgrades legacy PIN metadata on login before program PIN authorization", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "fluxiq-automation-pin-legacy-"));
    try {
      const paths = {
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
      };
      const runtime = createGlobalProgramRuntime(paths);
      const firstLogin = await runtime.identityAccess.authenticate({ username: "admin", password: "admin" });
      await runtime.identityAccess.setPinAuthorized({
        userId: "admin",
        pin: "1234",
        sessionId: firstLogin.session.id,
        authorizationPassword: "admin",
        authorizationPin: undefined,
        authorizationTotp: undefined
      });

      const repository = new SQLiteRepository({ rootDir: paths.databases, kind: "identity.users" });
      const credentialRecord = await repository.get("credential:admin", {});
      const metadata = credentialRecord?.data.metadata as Record<string, unknown> | undefined;
      expect(metadata?.pinVerifierHash).toBeTruthy();
      delete metadata!.pinVerifierHash;
      await repository.put({ ...credentialRecord!, data: { ...credentialRecord!.data, metadata: metadata as any } });

      const reloadedRuntime = createGlobalProgramRuntime(paths);
      const login = await reloadedRuntime.identityAccess.authenticate({ username: "admin", password: "admin" });
      await expect(reloadedRuntime.api.call({
        programId: "automation-studio",
        endpoint: "create-project-category",
        scope: {},
        actor: actorFor(login),
        payload: { name: "Recovered", authSessionId: login.session.id, authorizationPin: "1234" }
      })).resolves.toMatchObject({ ok: true, payload: { category: { name: "Recovered" } } });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });


  it("sees persisted sessions created by another identity runtime", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "fluxiq-identity-"));
    try {
      const repository = new SQLiteRepository({ rootDir: root, kind: "identity.users" });
      const pageRuntime = new IdentityAccessService({ repository });
      expect(await pageRuntime.validateSession("missing")).toBeNull();

      const loginRuntime = new IdentityAccessService({ repository: new SQLiteRepository({ rootDir: root, kind: "identity.users" }) });
      const login = await loginRuntime.authenticate({ username: "admin", password: "admin" });
      const credentialRecord = await repository.get("credential:admin", {});

      expect(await pageRuntime.validateSession(login.session.id)).toMatchObject({
        user: { id: "admin" }
      });
      expect(credentialRecord?.data.encrypted).toBe(true);
      expect(credentialRecord?.data.credential).toBeUndefined();
      expect(JSON.stringify(credentialRecord?.data)).not.toContain("passwordHash");
      expect(JSON.stringify(credentialRecord?.data.sealed)).not.toContain("passwordHash");
      expect(JSON.stringify(credentialRecord?.data.sealed)).not.toContain("admin");
      expect(credentialRecord?.data.sealed).toMatchObject({
        algorithm: "aes-256-gcm",
        kdf: "scrypt"
      });
      expect(credentialRecord?.data.metadata).toMatchObject({
        userId: "admin",
        passwordConfigured: true,
        pinConfigured: false
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("migrates a legacy plaintext credential record after that user logs in", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "fluxiq-identity-legacy-"));
    try {
      const repository = new SQLiteRepository({ rootDir: root, kind: "identity.users" });
      const nowMs = Date.now();
      for (const user of [
        { id: "legacy", username: "legacy", password: "legacy-password" },
        { id: "waiting", username: "waiting", password: "waiting-password" }
      ]) {
        await repository.put(createRecord({
          id: `user:${user.id}`,
          kind: "identity.users",
          data: {
            stateKind: "user",
            recordType: "user",
            user: {
              id: user.id,
              username: user.username,
              displayName: user.username,
              roleId: "admin",
              enabled: true,
              totpEnabled: false,
              createdAtMs: nowMs,
              updatedAtMs: nowMs
            }
          },
          nowMs
        }));
        await repository.put(createRecord({
          id: `credential:${user.id}`,
          kind: "identity.users",
          data: {
            stateKind: "credential",
            recordType: "credential",
            credential: {
              userId: user.id,
              passwordHash: testHashSecret(user.password),
              updatedAtMs: nowMs
            }
          },
          nowMs
        }));
      }

      const service = new IdentityAccessService({ repository: new SQLiteRepository({ rootDir: root, kind: "identity.users" }) });
      await expect(service.authenticate({ username: "legacy", password: "legacy-password" })).resolves.toMatchObject({
        user: { id: "legacy" }
      });

      const migrated = await repository.get("credential:legacy", {});
      const waiting = await repository.get("credential:waiting", {});
      expect(migrated?.data.encrypted).toBe(true);
      expect(migrated?.data.credential).toBeUndefined();
      expect(JSON.stringify(migrated?.data.sealed)).not.toContain("passwordHash");
      expect(waiting?.data.credential).toBeDefined();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("requires an authenticator code after password passes for 2FA users", async () => {
    const service = new IdentityAccessService();
    const setup = await service.beginTotp("admin");
    const code = testTotpCode(setup.secret);
    expect(setup.qrSvg).toContain("<svg");
    expect(setup.otpauthUrl).toContain("otpauth://totp/");
    await service.confirmTotp("admin", code);

    await expect(service.authenticate({ username: "admin", password: "admin" })).rejects.toBeInstanceOf(TotpRequiredError);
    await expect(service.authenticate({ username: "admin", password: "admin", totp: code })).resolves.toMatchObject({
      user: { id: "admin" }
    });
  });


  it("requires fresh credentials before disabling two-factor authentication", async () => {
    const runtime = createGlobalProgramRuntime();
    const setup = await runtime.identityAccess.beginTotp("admin");
    const code = testTotpCode(setup.secret);
    await runtime.identityAccess.confirmTotp("admin", code);
    const login = await runtime.identityAccess.authenticate({ username: "admin", password: "admin", totp: code });

    await expect(runtime.api.call({
      programId: "identity-access",
      endpoint: "disable-totp",
      scope: {},
      actor: actorFor(login),
      payload: { userId: "admin", authSessionId: login.session.id, authorizationPassword: "admin" }
    })).resolves.toMatchObject({ ok: false, requiresRecheck: true });

    await expect(runtime.api.call({
      programId: "identity-access",
      endpoint: "disable-totp",
      scope: {},
      actor: actorFor(login),
      payload: { userId: "admin", authSessionId: login.session.id, authorizationPassword: "admin", authorizationTotp: code }
    })).resolves.toMatchObject({ ok: true });
    expect((await runtime.identityAccess.snapshot()).users.find((user) => user.id === "admin")?.totpEnabled).toBe(false);
  });

});

function testHashSecret(value: string): string {
  const salt = crypto.randomBytes(16).toString("base64url");
  const hash = crypto.scryptSync(value, salt, 32).toString("base64url");
  return `scrypt:${salt}:${hash}`;
}
