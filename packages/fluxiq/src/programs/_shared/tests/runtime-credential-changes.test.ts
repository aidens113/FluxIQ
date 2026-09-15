// The global runtime subscribes Secret Keys to Identity Access's credential-change
// port. These tests run at the production derivation cost. "admin" is the
// bootstrap administrator's default password; every other password is a dummy.

import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createGlobalProgramRuntime } from "../../index.ts";

type Runtime = ReturnType<typeof createGlobalProgramRuntime>;

const BOOTSTRAP_PASSWORD = "admin";
const NEXT_PASSWORD = "dummy-password-next";
const USER_TWO_PASSWORD = "dummy-password-user-two";
const USER_TWO_RESET = "dummy-password-user-two-reset";
const SECRET_VALUE = "dummy-provider-secret-value";
const NOT_OPENED = "Secret key could not be opened";

describe("global runtime credential-change wiring", () => {
  it("re-seals a user's Secret Keys when that user changes their own password, so they reveal with the new password and not the old", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "fluxiq-credential-change-"));
    const open: Runtime[] = [];
    try {
      const runtime = track(open, createGlobalProgramRuntime(testPaths(root)));
      const login = await runtime.identityAccess.authenticate({ username: "admin", password: BOOTSTRAP_PASSWORD });
      const key = await runtime.secretKeys.createKey({ name: "Provider", value: SECRET_VALUE, authorizationPassword: BOOTSTRAP_PASSWORD, createdBy: login.user.id });

      await runtime.identityAccess.setPasswordAuthorized({
        userId: login.user.id,
        password: NEXT_PASSWORD,
        sessionId: login.session.id,
        authorizationPassword: BOOTSTRAP_PASSWORD,
        authorizationPin: undefined,
        authorizationTotp: undefined
      });

      await expect(runtime.secretKeys.revealKey({ id: key.id, authorizationPassword: NEXT_PASSWORD, actorUserId: login.user.id })).resolves.toMatchObject({ value: SECRET_VALUE });
      await expect(runtime.secretKeys.revealKey({ id: key.id, authorizationPassword: BOOTSTRAP_PASSWORD, actorUserId: login.user.id })).rejects.toThrow(NOT_OPENED);

      // A restart over the same databases reads the committed seal, not only the one held in memory.
      await closeAll(open);
      const restarted = track(open, createGlobalProgramRuntime(testPaths(root)));
      await expect(restarted.identityAccess.authenticate({ username: "admin", password: NEXT_PASSWORD })).resolves.toMatchObject({ user: { id: login.user.id } });
      await expect(restarted.secretKeys.revealKey({ id: key.id, authorizationPassword: NEXT_PASSWORD })).resolves.toMatchObject({ value: SECRET_VALUE });
      await expect(restarted.secretKeys.revealKey({ id: key.id, authorizationPassword: BOOTSTRAP_PASSWORD })).rejects.toThrow(NOT_OPENED);
    } finally {
      await closeAll(open);
      await rm(root, { recursive: true, force: true });
    }
  }, 120_000);

  it("lets an administrator reset another account's password, whose Secret Keys stay sealed under the old password", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "fluxiq-credential-reset-"));
    const open: Runtime[] = [];
    try {
      const runtime = track(open, createGlobalProgramRuntime(testPaths(root)));
      const admin = await runtime.identityAccess.authenticate({ username: "admin", password: BOOTSTRAP_PASSWORD });
      await runtime.identityAccess.upsertUser({ id: "user.two", username: "user-two", displayName: "User Two", roleId: "admin", password: USER_TWO_PASSWORD });
      const userTwo = await runtime.identityAccess.authenticate({ username: "user-two", password: USER_TWO_PASSWORD });
      const key = await runtime.secretKeys.createKey({ name: "User two key", value: SECRET_VALUE, authorizationPassword: USER_TWO_PASSWORD, createdBy: userTwo.user.id });

      await runtime.identityAccess.setPasswordAuthorized({
        userId: "user.two",
        password: USER_TWO_RESET,
        sessionId: admin.session.id,
        authorizationPassword: BOOTSTRAP_PASSWORD,
        authorizationPin: undefined,
        authorizationTotp: undefined
      });

      await expect(runtime.identityAccess.authenticate({ username: "user-two", password: USER_TWO_RESET })).resolves.toMatchObject({ user: { id: "user.two" } });
      await expect(runtime.secretKeys.revealKey({ id: key.id, authorizationPassword: USER_TWO_RESET })).rejects.toThrow(NOT_OPENED);
      await expect(runtime.secretKeys.revealKey({ id: key.id, authorizationPassword: USER_TWO_PASSWORD })).resolves.toMatchObject({ value: SECRET_VALUE });
    } finally {
      await closeAll(open);
      await rm(root, { recursive: true, force: true });
    }
  }, 120_000);
});

function track(open: Runtime[], runtime: Runtime): Runtime {
  open.push(runtime);
  return runtime;
}

async function closeAll(open: Runtime[]): Promise<void> {
  for (const runtime of open.splice(0)) {
    await runtime.automationStudio.close();
    runtime.secretKeys.close();
  }
}

function testPaths(root: string) {
  return {
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
}
