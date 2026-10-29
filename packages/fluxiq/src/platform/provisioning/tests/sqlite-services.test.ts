// @fluxiq-test-group real-sql
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { MemoryIamAuditSink } from "../../iam/index.ts";
import { IdentityAccessService } from "../../../programs/identity-access/index.ts";
import { SQLiteRepository } from "../../../programs/database-manager/index.ts";
import { MemoryEmailSender } from "../email/index.ts";
import { createPlatformServices } from "../service/index.ts";
import { accountInput, latestLinkToken } from "./provisioning-fixture.ts";

// The services over two real SQLite repositories (kinds "platform.store" and
// "platform.iam"): the repository stamps its own kind on every row, so this
// proves the IAM rows are read back by id prefix and the provisioner stays
// allowed across a restart. Dummy password; scrypt at N=2^10.

const WEAK_KDF = { testOnlyWeakParameters: { N: 2 ** 10, r: 8, p: 1, keyLength: 32 } as const };
const PASSWORD = "a long enough dummy password";

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function openServices(rootDir: string, identity: IdentityAccessService, email: MemoryEmailSender) {
  return createPlatformServices({
    repository: new SQLiteRepository({ rootDir, kind: "platform.store", layoutVersion: 2 }),
    iamRepository: new SQLiteRepository({ rootDir, kind: "platform.iam", layoutVersion: 2 }),
    identity,
    email,
    auditSink: new MemoryIamAuditSink(),
    publicOrigin: "https://app.example.test/",
    tenancy: { mode: "multi" }
  });
}

describe("platform services over SQLite", () => {
  it("creates an account, redeems the welcome link, signs in, and still allows the provisioner after a restart", async () => {
    const rootDir = await mkdtemp(path.join(os.tmpdir(), "fluxiq-platform-sqlite-"));
    directories.push(rootDir);
    const identity = new IdentityAccessService({ passwordKdf: WEAK_KDF });
    const email = new MemoryEmailSender();
    const services = await openServices(rootDir, identity, email);

    const created = await services.provisioning.run("createAccount", accountInput({ sendWelcome: true }), services.provisionerCaller("10.1.2.3"));
    expect(created.ok).toBe(true);
    if (!created.ok) throw new Error("expected createAccount to succeed");
    expect(created.result.status).toBe("created");

    const redeemed = await services.links.redeemWelcome({ token: latestLinkToken(email, "welcomeUrl"), password: PASSWORD });
    expect(redeemed.ok).toBe(true);
    const signedIn = await identity.authenticate({ username: "person@example.test", password: PASSWORD });
    expect(signedIn.user.username).toBe("person@example.test");

    const restarted = await openServices(rootDir, identity, new MemoryEmailSender());
    const again = await restarted.provisioning.run("createAccount", accountInput({ requestId: "req-create-2" }), restarted.provisionerCaller("10.1.2.3"));
    expect(again).toEqual({ ok: true, result: { status: "exists" } });
  });
});
