import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { CloudAdmissionService } from "../../../commerce/index.ts";
import type {
  CommerceAdmissionRequest,
  CommerceEntitlementGrant,
  CommerceExecutionAuthority,
  CommerceSubscriptionRecord
} from "../../../commerce/index.ts";
import { SQLiteEnvironmentStore } from "../../storage/index.ts";
import { DEDICATED_ENVIRONMENT_CAPABILITY, dedicatedEnvironmentTarget, EnvironmentController, FakeEnvironmentDriver } from "../index.ts";
import type { EnvironmentEnrolment } from "../index.ts";

/** A signed-in person: the account and the workspaces the server's IAM lets them act in. */
export type TestActor = { principalId: string; accountId: string; workspaceIds: readonly string[] };

export const ownerA: TestActor = { principalId: "principal-a", accountId: "account-a", workspaceIds: ["workspace-a"] };
export const ownerB: TestActor = { principalId: "principal-b", accountId: "account-b", workspaceIds: ["workspace-b"] };

/** Which account and workspace own each environment id, as the commerce grant and IAM would say. */
export type Ownership = Map<string, { accountId: string; workspaceId: string; allocation?: "shared" | "dedicated" }>;

export function dedicatedGrant(resourceIds: readonly string[], overrides: Partial<CommerceEntitlementGrant> = {}): CommerceEntitlementGrant {
  const base: CommerceEntitlementGrant = {
    key: "cloud.dedicated",
    allocation: "dedicated",
    capabilities: [DEDICATED_ENVIRONMENT_CAPABILITY],
    regions: ["region-a"],
    resourceIds: [...resourceIds],
    validFromMs: 1_000,
    validUntilMs: 5_000
  };
  return { ...base, ...overrides };
}

export function subscription(accountId: string, entitlements: readonly CommerceEntitlementGrant[]): CommerceSubscriptionRecord {
  return {
    providerId: "fixture-provider",
    accountId,
    customerId: `customer-${accountId}`,
    subscriptionId: `subscription-${accountId}`,
    version: 1,
    status: "active",
    paidThroughMs: 5_000,
    cancelAtPeriodEnd: false,
    endedAtMs: null,
    verifiedAtMs: 1_500,
    entitlements: [...entitlements]
  };
}

/** The server-side IAM target resolver: the actor must hold the workspace that owns the environment. */
function resolver(ownership: Ownership): (request: CommerceAdmissionRequest<TestActor>) => Promise<CommerceExecutionAuthority | null> {
  return async (request) => {
    const owner = ownership.get(request.targetId);
    if (owner === undefined || owner.accountId !== request.actor.accountId || owner.workspaceId !== request.workspaceId) return null;
    if (!request.actor.workspaceIds.includes(request.workspaceId)) return null;
    const target = owner.allocation === "shared"
      ? { kind: "managed-cloud" as const, allocation: "shared" as const, region: "region-a", targetId: request.targetId, ownerAccountId: owner.accountId, ownerWorkspaceId: owner.workspaceId, capabilities: [DEDICATED_ENVIRONMENT_CAPABILITY] }
      : dedicatedEnvironmentTarget({ environmentId: request.targetId, accountId: owner.accountId, workspaceId: owner.workspaceId }, "region-a");
    return {
      principalId: request.actor.principalId,
      accountId: owner.accountId,
      workspaceId: request.workspaceId,
      target,
      cloudAuthorization: { accountId: owner.accountId, workspaceId: request.workspaceId }
    };
  };
}

export type Harness = {
  rootDir: string;
  store: SQLiteEnvironmentStore;
  driver: FakeEnvironmentDriver;
  controller: EnvironmentController<TestActor>;
  ownership: Ownership;
  subscriptions: CommerceSubscriptionRecord[];
  admissions: number;
};

const roots: string[] = [];

export async function removeHarnessRoots(): Promise<void> {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
}

/** A controller over a real SQLite store, the fake driver and the real commerce admission. */
export async function harness(options: { rootDir?: string; driver?: FakeEnvironmentDriver; enrolment?: EnvironmentEnrolment } = {}): Promise<Harness> {
  const rootDir = options.rootDir ?? await mkdtemp(path.join(os.tmpdir(), "fluxiq-environments-"));
  if (options.rootDir === undefined) roots.push(rootDir);
  const ownership: Ownership = new Map();
  const subscriptions: CommerceSubscriptionRecord[] = [];
  const authorize = resolver(ownership);
  const service = new CloudAdmissionService<TestActor>({
    deploymentMode: "service",
    authorize,
    ledger: { listSubscriptions: async (accountId) => subscriptions.filter((entry) => entry.accountId === accountId) },
    policy: {
      id: "policy-1",
      maxVerificationAgeMs: 1_000,
      allowTrial: false,
      graceMs: 0,
      entitlementKeys: { control: "cloud.control", shared: "cloud.shared", dedicated: "cloud.dedicated" }
    },
    now: () => 2_000
  });
  const store = new SQLiteEnvironmentStore({ rootDir, now: () => 2_000 });
  const driver = options.driver ?? new FakeEnvironmentDriver();
  const state: Harness = {
    rootDir,
    store,
    driver,
    ownership,
    subscriptions,
    admissions: 0,
    controller: new EnvironmentController<TestActor>({
      store,
      driver,
      authorize,
      ...(options.enrolment !== undefined ? { enrolment: options.enrolment } : {}),
      admission: {
        admit: (request) => {
          state.admissions += 1;
          return service.admit(request);
        }
      }
    })
  };
  return state;
}

/** Gives `actor` a paid dedicated grant for these environment ids, owned by its first workspace. */
export function entitle(state: Harness, actor: TestActor, environmentIds: readonly string[]): void {
  for (const environmentId of environmentIds) {
    state.ownership.set(environmentId, { accountId: actor.accountId, workspaceId: actor.workspaceIds[0]! });
  }
  state.subscriptions.push(subscription(actor.accountId, [dedicatedGrant(environmentIds)]));
}

export function command(actor: TestActor, environmentId: string, operationId: string): { actor: TestActor; workspaceId: string; environmentId: string; operationId: string } {
  return { actor, workspaceId: actor.workspaceIds[0]!, environmentId, operationId };
}
