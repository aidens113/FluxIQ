// The credential-change port: prepare refuses, a commit failure after the
// write never fails the change. Derivations run at the test-only N=2^10. Every
// password and secret here is a dummy value.

import { afterEach, describe, expect, it, vi } from "vitest";
import type { ScryptParameters } from "../../../_shared/password-kdf/index.ts";
import type { RecordEnvelope, Repository } from "../../../database-manager/index.ts";
import type { IdentityCredentialChange, IdentityCredentialChangeSubscriber } from "../../types.ts";
import { runCredentialChange, type CredentialCommitFailure } from "../run-credential-change.ts";
import { IdentityAccessService } from "../service.ts";

const WEAK: ScryptParameters = { N: 2 ** 10, r: 8, p: 1, keyLength: 32 };
const PASSWORD = "dummy-password";
const NEW_PASSWORD = "dummy-password-changed";
const SECRET_IN_ERROR = "dummy-secret-in-commit-error";
const INVALID = "Invalid username or credentials";

const change: IdentityCredentialChange = {
  changeId: "change.one",
  userId: "user.one",
  actorUserId: "user.one",
  currentPassword: PASSWORD,
  newPassword: NEW_PASSWORD
};

class MemoryRepository implements Repository {
  private readonly records = new Map<string, RecordEnvelope>();

  async list(): Promise<RecordEnvelope[]> {
    return [...this.records.values()].map((item) => structuredClone(item));
  }

  async get(id: string): Promise<RecordEnvelope | null> {
    const item = this.records.get(id);
    return item ? structuredClone(item) : null;
  }

  async put(item: RecordEnvelope): Promise<RecordEnvelope> {
    this.records.set(item.id, structuredClone(item));
    return item;
  }

  async delete(id: string): Promise<boolean> {
    return this.records.delete(id);
  }
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("runCredentialChange", () => {
  it("returns the write's result when a commit fails after the write, still commits the rest, and records ids and counts only", async () => {
    const events: string[] = [];
    const failures: CredentialCommitFailure[] = [];

    const result = await runCredentialChange(
      [recording("first", events), recording("failing", events, { failCommit: true }), recording("last", events)],
      change,
      async () => {
        events.push("write");
        return "written";
      },
      (failure) => failures.push(failure)
    );

    expect(result).toBe("written");
    expect(events).toEqual(["first:prepare", "failing:prepare", "last:prepare", "write", "first:commit", "failing:commit", "last:commit"]);
    expect(failures).toEqual([{ changeId: "change.one", userId: "user.one", failedSubscriberCount: 1, subscriberCount: 3 }]);
  });

  it("warns by default with the change id, user id, and counts, never the error text or a password", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await expect(runCredentialChange([recording("failing", [], { failCommit: true })], change, async () => "written")).resolves.toBe("written");

    expect(warn).toHaveBeenCalledTimes(1);
    const line = String(warn.mock.calls[0]?.[0]);
    expect(line).toContain("change.one");
    expect(line).toContain("user.one");
    expect(line).toContain("1 of 1");
    for (const secret of [SECRET_IN_ERROR, PASSWORD, NEW_PASSWORD]) expect(line).not.toContain(secret);
  });

  it("still returns the write's result when recording the commit failure throws", async () => {
    await expect(runCredentialChange([recording("failing", [], { failCommit: true })], change, async () => "written", () => {
      throw new Error("recorder unavailable");
    })).resolves.toBe("written");
  });

  it("refuses the change when a prepare fails: nothing is written, every subscriber asked is aborted, and nothing is recorded", async () => {
    const events: string[] = [];
    const failures: CredentialCommitFailure[] = [];

    await expect(runCredentialChange(
      [recording("ready", events), recording("failing", events, { failPrepare: true }), recording("never", events)],
      change,
      async () => {
        events.push("write");
        return "written";
      },
      (failure) => failures.push(failure)
    )).rejects.toThrow("prepare failed");

    expect(events).toEqual(["ready:prepare", "failing:prepare", "ready:abort", "failing:abort"]);
    expect(failures).toEqual([]);
  });
});

describe("IdentityAccessService password change with a failing commit", () => {
  it("succeeds once the credential is written, leaving the new password working", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const repository = new MemoryRepository();
    const events: string[] = [];
    const identity = new IdentityAccessService({
      repository,
      passwordKdf: { testOnlyWeakParameters: WEAK },
      credentialChangeSubscribers: [recording("failing", events, { failCommit: true })]
    });
    await identity.upsertUser({ id: "user.one", username: "user-one", displayName: "User One", roleId: "admin", password: PASSWORD });
    const login = await identity.authenticate({ username: "user-one", password: PASSWORD });

    await expect(identity.setPasswordAuthorized({
      userId: "user.one",
      password: NEW_PASSWORD,
      sessionId: login.session.id,
      authorizationPassword: PASSWORD,
      authorizationPin: undefined,
      authorizationTotp: undefined
    })).resolves.toMatchObject({ userId: "user.one" });

    expect(events).toEqual(["failing:prepare", "failing:commit"]);
    expect(warn).toHaveBeenCalledTimes(1);
    await expect(identity.authenticate({ username: "user-one", password: NEW_PASSWORD })).resolves.toMatchObject({ user: { id: "user.one" } });
    await expect(identity.authenticate({ username: "user-one", password: PASSWORD })).rejects.toThrow(INVALID);
    const restarted = new IdentityAccessService({ repository, passwordKdf: { testOnlyWeakParameters: WEAK } });
    await expect(restarted.authenticate({ username: "user-one", password: NEW_PASSWORD })).resolves.toMatchObject({ user: { id: "user.one" } });
    await expect(restarted.authenticate({ username: "user-one", password: PASSWORD })).rejects.toThrow(INVALID);
  });
});

function recording(name: string, events: string[], options: { failPrepare?: boolean; failCommit?: boolean } = {}): IdentityCredentialChangeSubscriber {
  return {
    prepare: async () => {
      events.push(`${name}:prepare`);
      if (options.failPrepare) throw new Error("prepare failed");
    },
    commit: async () => {
      events.push(`${name}:commit`);
      if (options.failCommit) throw new Error(SECRET_IN_ERROR);
    },
    abort: async () => {
      events.push(`${name}:abort`);
    }
  };
}
