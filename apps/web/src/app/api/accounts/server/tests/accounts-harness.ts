import { GlobalProgramApiRegistry, IdentityAccessService } from "fluxiq";
import {
  createPlatformServices,
  MemoryEmailSender,
  MemoryIamAuditSink,
  type IamRecordEnvelope,
  type IamRecordRepository,
  type IamRecordScope,
  type PlatformRecordRepository,
  type PlatformServices,
  resolveIamPredefinedPolicy
} from "fluxiq/platform";
import { panelRouteActor } from "../../../../../lib/app-route-iam";
import type { AccountRouteDeps } from "../route-deps";

// Test support for the accounts handlers: the real Identity Access service
// (at the test-only weak key-derivation cost) under the real platform
// services, single tenancy, over memory repositories and a memory email
// sender, decided by a real `GlobalProgramApiRegistry`. Every password here is
// a dummy value, and no token, password or session id is ever printed.

const WEAK_KDF = { testOnlyWeakParameters: { N: 2 ** 10, r: 8, p: 1, keyLength: 32 } as const };

export const WORKSPACE_ID = "workspace-main";
export const DUMMY_PASSWORD = "a dummy password for tests";

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

export type Person = { userId: string; sessionId: string; roleId: string };

export type AccountsHarness = {
  services: PlatformServices;
  identityAccess: IdentityAccessService;
  email: MemoryEmailSender;
  owner: Person;
  admin: Person;
  viewer: Person;
  /** The handlers' dependencies as `person`, decided on `profile` (`service` decides by the person's policies). */
  deps(person: Person, profile?: "local" | "service"): Promise<AccountRouteDeps>;
  /** A person with a password, signed in, holding one policy. */
  addPerson(email: string, policy: string): Promise<Person>;
};

let requests = 0;

export async function createAccountsHarness(): Promise<AccountsHarness> {
  const repository = new MemoryRecordRepository();
  const email = new MemoryEmailSender();
  const identityAccess = new IdentityAccessService({ repository: new MemoryRecordRepository(), passwordKdf: WEAK_KDF });
  const services = await createPlatformServices({
    repository,
    iamRepository: repository,
    identity: identityAccess,
    email,
    auditSink: new MemoryIamAuditSink(),
    publicOrigin: "https://app.example.test/",
    tenancy: { mode: "single", workspaceId: WORKSPACE_ID }
  });

  async function addPerson(address: string, policy: string): Promise<Person> {
    const answer = await services.provisioning.run(
      "createAccount",
      { requestId: `harness-${(requests += 1)}`, email: address, displayName: address.split("@")[0] ?? address, policies: [policy], workspace: WORKSPACE_ID, password: DUMMY_PASSWORD },
      { kind: "in-process", actorUserId: null, transport: "in-process" }
    );
    if (!answer.ok) throw new Error(`harness person was not created: ${answer.error.code}`);
    const created = answer.result;
    if (created.status !== "created") throw new Error(`harness person was not created: ${created.status}`);
    const session = await identityAccess.createSession(created.userId);
    const user = (await identityAccess.snapshot()).users.find((candidate) => candidate.id === created.userId);
    return { userId: created.userId, sessionId: session.id, roleId: user?.roleId ?? "viewer" };
  }

  const owner = await addPerson("owner@example.test", "FluxIQOwnerFullAccess");
  const admin = await addPerson("admin@example.test", "FluxIQAdministratorAccess");
  const viewer = await addPerson("viewer@example.test", "FluxIQReadOnlyAccess");

  async function deps(person: Person, profile: "local" | "service" = "local"): Promise<AccountRouteDeps> {
    const snapshot = await identityAccess.snapshot();
    const role = snapshot.roles.find((candidate) => candidate.id === person.roleId) ?? { id: person.roleId, permissions: [] };
    const authorizer = profile === "local" ? new GlobalProgramApiRegistry() : serviceRegistry(services, person);
    return {
      actor: { ...panelRouteActor({ session: { id: person.sessionId }, user: { id: person.userId }, role }), userId: person.userId },
      sessionId: person.sessionId,
      authorizer,
      identityAccess,
      profile: profile === "local" ? "local" : "service",
      platform: async () => ({ provisioning: services.provisioning, store: services.store, workspaceId: WORKSPACE_ID, tenancy: "single" })
    };
  }

  return { services, identityAccess, email, owner, admin, viewer, deps, addPerson };
}

/** A `service` registry that decides by the person's membership policies, as the hosted workspace does. */
function serviceRegistry(services: PlatformServices, person: Person): GlobalProgramApiRegistry {
  return new GlobalProgramApiRegistry({
    iam: {
      profile: "service",
      source: {
        resolvePolicySet: async () => {
          const membership = await services.store.getMembership(WORKSPACE_ID, person.userId);
          const identity = (membership?.policies ?? []).flatMap((name) => {
            const policy = resolveIamPredefinedPolicy(name);
            return policy === null ? [] : [policy];
          });
          return { identity, guardrails: [], sessions: [], boundary: null };
        },
        getRole: async () => null
      }
    }
  });
}
