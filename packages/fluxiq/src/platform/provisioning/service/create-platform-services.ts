import { IamAuthorizer, IamStore, resolveIamPredefinedPolicy } from "../../iam/index.ts";
import type { IamRecordRepository } from "../../iam/index.ts";
import { createPlatformStore } from "../../store/index.ts";
import type { PlatformRecordRepository, PlatformStore } from "../../store/index.ts";
import type { PlatformProvisioningDeps, PlatformProvisioningService } from "../context/index.ts";
import type { PlatformAccountLinks, PlatformProvisioningCaller } from "../types.ts";
import { createPlatformProvisioning } from "./create-platform-provisioning.ts";
import { ensureProvisionerIdentity } from "./ensure-provisioner-identity.ts";

/** The service identity the website backend calls as, unless `serviceIdentityName` says otherwise. */
const DEFAULT_SERVICE_IDENTITY = "website-backend";

/**
 * What `createPlatformServices` composes from: `repository` for the platform
 * rows (the store tells its kinds apart by id prefix), `iamRepository` for the
 * IAM rows (platform level and every workspace's, told apart by scope), plus
 * every provisioning dependency except those it builds (the store, the
 * authorizer and the workspace attachments). The two may be the same object
 * (memory) or two repositories of different kinds (SQLite). Both stores tell
 * their kinds apart by id prefix, so a repository that stamps its own kind on
 * every row (`SQLiteRepository`) needs no wrapper.
 */
export type PlatformServicesOptions = Omit<PlatformProvisioningDeps, "store" | "authorizer" | "iamAttachments"> & {
  repository: PlatformRecordRepository;
  iamRepository: IamRecordRepository;
  serviceIdentityName?: string;
};

/** The composed platform services, and the caller the private listener passes for each request. */
export type PlatformServices = {
  store: PlatformStore;
  provisioning: PlatformProvisioningService;
  links: PlatformAccountLinks;
  provisionerCaller(sourceIp?: string): PlatformProvisioningCaller;
};

/**
 * Composes the platform store, the platform-level `IamStore` and an
 * `IamAuthorizer` over it (both writing to `auditSink`), one `IamStore` per
 * workspace for member attachments, and the provisioning service; and makes
 * sure the website's service identity exists with `FluxIQProvisioner`
 * attached (idempotent, so it runs at every start).
 */
export async function createPlatformServices(options: PlatformServicesOptions): Promise<PlatformServices> {
  const { repository, iamRepository, serviceIdentityName, ...deps } = options;
  const now = options.now ?? Date.now;
  const store = createPlatformStore({ repository });
  const platformIam = new IamStore({ workspaceId: null, repository: iamRepository, resolveManagedPolicy: resolveIamPredefinedPolicy, auditSink: options.auditSink, now });
  const authorizer = new IamAuthorizer(platformIam, options.auditSink);
  const workspaceStores = new Map<string, IamStore>();
  const iamAttachments = (workspaceId: string): IamStore => {
    const existing = workspaceStores.get(workspaceId);
    if (existing !== undefined) return existing;
    const created = new IamStore({ workspaceId, repository: iamRepository, resolveManagedPolicy: resolveIamPredefinedPolicy, auditSink: options.auditSink, now });
    workspaceStores.set(workspaceId, created);
    return created;
  };
  const name = serviceIdentityName ?? DEFAULT_SERVICE_IDENTITY;
  await ensureProvisionerIdentity(platformIam, name);
  const provisioning = createPlatformProvisioning({ ...deps, store, authorizer, iamAttachments });
  const provisionerCaller = (sourceIp?: string): PlatformProvisioningCaller =>
    sourceIp === undefined ? { kind: "service-identity", name, transport: "http" } : { kind: "service-identity", name, transport: "http", sourceIp };
  return { store, provisioning, links: provisioning, provisionerCaller };
}
