import { describe, expect, it } from "vitest";
import { MemoryIamAuditSink } from "../../iam/index.ts";
import { IdentityAccessService } from "../../../programs/identity-access/index.ts";
import { MemoryEmailSender } from "../email/index.ts";
import { createPlatformServices } from "../service/index.ts";
import { accountInput } from "./provisioning-fixture.ts";
import { MemoryRecordRepository } from "./memory-record-repository.ts";

// With the real identity-access service: an email that a person without an
// account already signs in with, in any case, is answered as an email in use
// (`email_taken` in-process, `exists` over HTTP with the account-exists mail),
// never a generic error, and nothing is written: no account, workspace,
// membership or identity user, and the person's own user is as it was.
// Dummy values only; scrypt at N=2^10.

const WEAK_KDF = { testOnlyWeakParameters: { N: 2 ** 10, r: 8, p: 1, keyLength: 32 } as const };
const LOCAL_PERSON = { id: "local-person", username: "PERSON@example.TEST", displayName: "Signs in without an account", roleId: "viewer" };

async function withLocalPerson() {
  const repository = new MemoryRecordRepository();
  const identity = new IdentityAccessService({ passwordKdf: WEAK_KDF });
  const email = new MemoryEmailSender();
  const services = await createPlatformServices({
    repository,
    iamRepository: repository,
    identity,
    email,
    auditSink: new MemoryIamAuditSink(),
    publicOrigin: "https://app.example.test/",
    tenancy: { mode: "multi" }
  });
  await identity.upsertUser(LOCAL_PERSON);
  const users = async () => (await identity.snapshot()).users.map((user) => ({ id: user.id, username: user.username, displayName: user.displayName, roleId: user.roleId, enabled: user.enabled }));
  const before = await users();
  const nothingWritten = async () => {
    expect(await services.store.listAccounts()).toEqual([]);
    expect(await services.store.listWorkspaces()).toEqual([]);
    expect(await users()).toEqual(before);
  };
  return { services, email, http: services.provisionerCaller("10.1.2.3"), nothingWritten };
}

describe("createAccount for an email a person without an account signs in with", () => {
  it("answers email_taken in-process, in any case, and writes nothing", async () => {
    const { services, nothingWritten } = await withLocalPerson();
    for (const [requestId, email] of [["req-lower", "person@example.test"], ["req-mixed", "Person@Example.test"]]) {
      const answer = await services.provisioning.run("createAccount", accountInput({ requestId, email }), { kind: "in-process", actorUserId: null, transport: "in-process" });
      expect(answer, email).toEqual({ ok: false, error: { code: "email_taken", message: "An account with this email already exists." } });
    }
    const fromCli = await services.provisioning.run("createAccount", accountInput({ requestId: "req-cli" }), { kind: "platform-admin", transport: "in-process" });
    expect(fromCli.ok === false && fromCli.error.code).toBe("email_taken");
    await nothingWritten();
  });

  it("answers exists over HTTP with the account-exists mail, as for an account, and writes nothing", async () => {
    const { services, email, http, nothingWritten } = await withLocalPerson();
    const answer = await services.provisioning.run("createAccount", accountInput(), http);
    expect(answer).toEqual({ ok: true, result: { status: "exists" } });
    expect(email.messages.map((message) => [message.template, message.to])).toEqual([["account-exists", "person@example.test"]]);
    await nothingWritten();
  });

  it("still creates an account for an email nobody signs in with", async () => {
    const { services, http } = await withLocalPerson();
    const answer = await services.provisioning.run("createAccount", accountInput({ email: "someone.else@example.test" }), http);
    expect(answer.ok && answer.result.status).toBe("created");
  });
});
