import { IdentityAccessService, SecretKeysService } from "fluxiq";
import {
  createPlatformServices,
  MemoryEmailSender,
  MemoryIamAuditSink,
  type IamRecordEnvelope,
  type IamRecordRepository,
  type IamRecordScope,
  type PlatformRecordRepository,
  type PlatformServices,
} from "fluxiq/platform";

// Test support for the welcome and reset routes: the real identity and
// secret-key services (at the test-only weak key-derivation cost) under the
// real platform services over memory repositories and a memory email sender.
// Identity keeps its rows in a repository, as in production, so `restart()`
// is a new process over the same rows: every credential is sealed again and
// not unlocked. Every password here is a dummy value.

const WEAK_KDF = { testOnlyWeakParameters: { N: 2 ** 10, r: 8, p: 1, keyLength: 32 } as const };

class MemoryRecordRepository implements PlatformRecordRepository, IamRecordRepository {
  private readonly rows = new Map<string, IamRecordEnvelope>();

  private key(id: string, scope: IamRecordScope = {}): string {
    return JSON.stringify([scope.domainId ?? null, id]);
  }

  async list(scope: IamRecordScope = {}): Promise<IamRecordEnvelope[]> {
    const domainId = scope.domainId ?? null;
    return [...this.rows.values()].filter((row) => (row.scope.domainId ?? null) === domainId).map((row) => structuredClone(row));
  }

  async get(id: string, scope: IamRecordScope = {}): Promise<IamRecordEnvelope | null> {
    const row = this.rows.get(this.key(id, scope));
    return row === undefined ? null : structuredClone(row);
  }

  async put(record: IamRecordEnvelope): Promise<IamRecordEnvelope> {
    this.rows.set(this.key(record.id, record.scope), structuredClone(record));
    return structuredClone(record);
  }

  async delete(id: string, scope: IamRecordScope = {}): Promise<boolean> {
    return this.rows.delete(this.key(id, scope));
  }
}

export type AccountLinkHarness = {
  services: PlatformServices;
  identityAccess: IdentityAccessService;
  secretKeys: SecretKeysService;
  email: MemoryEmailSender;
  /** Creates an account with a welcome email and returns its user id. */
  provision(email: string): Promise<string>;
  /** Creates an account in-process with a password (sealed in the identity rows) and a welcome email; returns its user id. */
  provisionWithPassword(email: string, password: string): Promise<string>;
  /** A new server process over the same rows and outbox: new identity, secret-key and platform services. */
  restart(): Promise<AccountLinkHarness>;
  /** The token in the newest emailed link of a kind. It is never printed. */
  latestToken(variable: "welcomeUrl" | "resetUrl"): string;
};

let requests = 0;

type HarnessRows = { repository: MemoryRecordRepository; identityRows: MemoryRecordRepository; email: MemoryEmailSender };

export async function createAccountLinkHarness(
  rows: HarnessRows = { repository: new MemoryRecordRepository(), identityRows: new MemoryRecordRepository(), email: new MemoryEmailSender() },
): Promise<AccountLinkHarness> {
  const { repository, identityRows, email } = rows;
  const identityAccess = new IdentityAccessService({ repository: identityRows, passwordKdf: WEAK_KDF });
  const secretKeys = new SecretKeysService({ passwordKdf: WEAK_KDF });
  const services = await createPlatformServices({
    repository,
    iamRepository: repository,
    identity: identityAccess,
    email,
    auditSink: new MemoryIamAuditSink(),
    publicOrigin: "https://app.example.test/",
    tenancy: { mode: "multi" },
  });
  return {
    services,
    identityAccess,
    secretKeys,
    email,
    async provision(address) {
      const answer = await services.provisioning.run(
        "createAccount",
        { requestId: `req-create-${(requests += 1)}`, email: address, displayName: "A Person", policies: ["FluxIQUserAccess"], workspace: "new", sendWelcome: true },
        services.provisionerCaller("10.1.2.3"),
      );
      if (!answer.ok || answer.result.status !== "created") throw new Error(`The account was not created: ${JSON.stringify(answer)}`);
      return answer.result.userId;
    },
    async provisionWithPassword(address, password) {
      const answer = await services.provisioning.run(
        "createAccount",
        { requestId: `req-create-${(requests += 1)}`, email: address, displayName: "A Person", policies: ["FluxIQUserAccess"], workspace: "new", sendWelcome: true, password },
        { kind: "in-process", actorUserId: null, transport: "in-process" },
      );
      if (!answer.ok || answer.result.status !== "created") throw new Error(`The account was not created: ${answer.ok ? answer.result.status : answer.error.code}`);
      return answer.result.userId;
    },
    restart: () => createAccountLinkHarness(rows),
    latestToken(variable) {
      const message = [...email.messages].reverse().find((candidate) => candidate.variables[variable] !== undefined);
      const url = message?.variables[variable];
      if (url === undefined) throw new Error(`No email carried ${variable}.`);
      return new URL(url).hash.replace(/^#token=/u, "");
    },
  };
}
