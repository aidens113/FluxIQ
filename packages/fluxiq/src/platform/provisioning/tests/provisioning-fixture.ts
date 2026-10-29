import { MemoryIamAuditSink } from "../../iam/index.ts";
import type { PlatformTenancy } from "../context/index.ts";
import { MemoryEmailSender } from "../email/index.ts";
import { createPlatformServices } from "../service/index.ts";
import type { PlatformServices } from "../service/index.ts";
import type { PlatformProvisioningCaller } from "../types.ts";
import { FakeIdentity } from "./fake-identity.ts";
import { MemoryRecordRepository } from "./memory-record-repository.ts";
import { TestClock } from "./test-clock.ts";

export type ProvisioningHarness = {
  services: PlatformServices;
  repository: MemoryRecordRepository;
  identity: FakeIdentity;
  email: MemoryEmailSender;
  audit: MemoryIamAuditSink;
  clock: TestClock;
  revokedClients: { userId: string; reason: string }[];
  deletedWorkspaces: string[];
  createdWorkspaces: string[];
  emailFailures: string[];
  http: PlatformProvisioningCaller;
  admin: PlatformProvisioningCaller;
  inProcess: PlatformProvisioningCaller;
};

export const SINGLE_WORKSPACE = "workspace-main";

/** The composed services over memory doubles, as `createPlatformServices` builds them in production. */
export async function createProvisioningHarness(options: { tenancy?: PlatformTenancy; organisation?: boolean; serviceIdentityName?: string } = {}): Promise<ProvisioningHarness> {
  const repository = new MemoryRecordRepository();
  const identity = new FakeIdentity();
  const email = new MemoryEmailSender();
  const audit = new MemoryIamAuditSink();
  const clock = new TestClock();
  const revokedClients: { userId: string; reason: string }[] = [];
  const deletedWorkspaces: string[] = [];
  const createdWorkspaces: string[] = [];
  const emailFailures: string[] = [];
  const services = await createPlatformServices({
    repository,
    iamRepository: repository,
    identity,
    email,
    auditSink: audit,
    publicOrigin: "https://app.example.test/",
    tenancy: options.tenancy ?? { mode: "multi" },
    serviceIdentityName: options.serviceIdentityName ?? "website-backend",
    entitlements: { organisation: options.organisation ?? false },
    revokeConnectedClients: async (userId, reason) => {
      revokedClients.push({ userId, reason });
      return 2;
    },
    deleteWorkspaceData: async (workspaceId) => {
      deletedWorkspaces.push(workspaceId);
    },
    onWorkspaceCreated: async (workspaceId) => {
      createdWorkspaces.push(workspaceId);
    },
    reportEmailFailure: (template) => {
      emailFailures.push(template);
    },
    now: () => clock.nowMs
  });
  return {
    services,
    repository,
    identity,
    email,
    audit,
    clock,
    revokedClients,
    deletedWorkspaces,
    createdWorkspaces,
    emailFailures,
    http: services.provisionerCaller("10.1.2.3"),
    admin: { kind: "platform-admin", transport: "in-process" },
    inProcess: { kind: "in-process", actorUserId: null, transport: "in-process" }
  };
}

/** The token in the newest emailed link of a template (`...#token=<token>`). */
export function latestLinkToken(email: MemoryEmailSender, variable: "welcomeUrl" | "resetUrl"): string {
  const message = [...email.messages].reverse().find((candidate) => candidate.variables[variable] !== undefined);
  const url = message?.variables[variable];
  if (url === undefined) throw new Error(`No email carried ${variable}.`);
  const token = new URL(url).hash.replace(/^#token=/u, "");
  if (token === "") throw new Error(`The ${variable} carried no token.`);
  return token;
}

/** A createAccount input with the given changes. */
export function accountInput(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { requestId: "req-create-1", email: "Person@Example.test", displayName: "A Person", policies: ["FluxIQUserAccess"], workspace: "new", ...overrides };
}
