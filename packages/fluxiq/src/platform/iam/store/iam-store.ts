import type { IamPrincipalType } from "@fluxiq/contracts/iam";
import type { IamPolicy, IamPolicySet, IamPrincipal } from "../types.ts";
import { IamAttachmentStore, IamBoundaryStore, IamGuardrailStore, IamInlineStore } from "./attachments/index.ts";
import { IamStoreScope, type IamChangeContext, type IamStoreOptions } from "./context/index.ts";
import { IamPolicyStore } from "./policies/index.ts";
import { IamGroupStore, IamRoleStore, IamServiceIdentityStore } from "./principals/index.ts";
import type {
  IamPolicyVersion,
  IamStoredGroup,
  IamStoredInlinePolicy,
  IamStoredPolicy,
  IamStoredRole,
  IamStoredServiceIdentity
} from "./records/index.ts";
import { IamPolicyResolver } from "./resolve/index.ts";

/**
 * The IAM attachments store of one workspace (or the platform level): customer-managed
 * policies and their versions, inline policies, attachments, groups, roles,
 * service identities, workspace guardrails and permission boundaries. Inert: it
 * decides nothing, it holds state and gathers the `IamPolicySet` for a
 * principal (`resolvePolicySet`).
 *
 * Every write validates, then records an `iam-change` audit record. Writes are
 * read-modify-write on the repository with no lock: one writer at a time per
 * workspace is the caller's job.
 *
 * A thin facade: each group of operations lives in its own collaborator
 * (`policies/`, `attachments/`, `principals/`, `resolve/`).
 */
export class IamStore {
  private readonly scope: IamStoreScope;
  private readonly policies: IamPolicyStore;
  private readonly attachments: IamAttachmentStore;
  private readonly inline: IamInlineStore;
  private readonly boundaries: IamBoundaryStore;
  private readonly guardrails: IamGuardrailStore;
  private readonly groups: IamGroupStore;
  private readonly roles: IamRoleStore;
  private readonly serviceIdentities: IamServiceIdentityStore;
  private readonly resolver: IamPolicyResolver;

  constructor(options: IamStoreOptions) {
    this.scope = new IamStoreScope(options);
    this.policies = new IamPolicyStore(this.scope);
    this.attachments = new IamAttachmentStore(this.scope, this.policies);
    this.inline = new IamInlineStore(this.scope);
    this.boundaries = new IamBoundaryStore(this.scope, this.policies);
    this.guardrails = new IamGuardrailStore(this.scope, this.policies);
    this.groups = new IamGroupStore(this.scope);
    this.roles = new IamRoleStore(this.scope, this.policies);
    this.serviceIdentities = new IamServiceIdentityStore(this.scope);
    this.resolver = new IamPolicyResolver(this.scope, {
      policies: this.policies,
      attachments: this.attachments,
      inline: this.inline,
      boundaries: this.boundaries,
      guardrails: this.guardrails,
      groups: this.groups,
      roles: this.roles
    });
  }

  /** The FRN of a principal of this store (`frn:fluxiq:iam:<workspaceId>:<type>/<id>`). */
  principalFrn(type: IamPrincipalType, id: string): string {
    return this.scope.principalFrn(type, id);
  }

  // ---- customer-managed policies -------------------------------------------------

  createPolicy(name: string, kind: IamStoredPolicy["kind"], document: unknown, context: IamChangeContext): Promise<IamStoredPolicy> {
    return this.policies.create(name, kind, document, context);
  }

  getPolicy(name: string): Promise<IamStoredPolicy | null> {
    return this.policies.get(name);
  }

  listPolicies(): Promise<IamStoredPolicy[]> {
    return this.policies.list();
  }

  createPolicyVersion(name: string, document: unknown, makeDefault: boolean, context: IamChangeContext): Promise<IamPolicyVersion> {
    return this.policies.createVersion(name, document, makeDefault, context);
  }

  setDefaultPolicyVersion(name: string, versionId: string, context: IamChangeContext): Promise<void> {
    return this.policies.setDefaultVersion(name, versionId, context);
  }

  deletePolicyVersion(name: string, versionId: string, context: IamChangeContext): Promise<void> {
    return this.policies.deleteVersion(name, versionId, context);
  }

  deletePolicy(name: string, context: IamChangeContext): Promise<void> {
    return this.policies.delete(name, context);
  }

  // ---- attachments, inline policies, boundaries, guardrails -----------------------

  attachPolicy(principalFrn: string, policyName: string, context: IamChangeContext): Promise<void> {
    return this.attachments.attach(principalFrn, policyName, context);
  }

  detachPolicy(principalFrn: string, policyName: string, context: IamChangeContext): Promise<void> {
    return this.attachments.detach(principalFrn, policyName, context);
  }

  listAttachedPolicies(principalFrn: string): Promise<string[]> {
    return this.attachments.list(principalFrn);
  }

  putInlinePolicy(principalFrn: string, name: string, document: unknown, context: IamChangeContext): Promise<void> {
    return this.inline.put(principalFrn, name, document, context);
  }

  deleteInlinePolicy(principalFrn: string, name: string, context: IamChangeContext): Promise<void> {
    return this.inline.delete(principalFrn, name, context);
  }

  listInlinePolicies(principalFrn: string): Promise<IamStoredInlinePolicy[]> {
    return this.inline.list(principalFrn);
  }

  /** Sets (or, with `policyName` null, removes) a user's or role's permission boundary, a managed policy of kind `boundary`. */
  setPermissionBoundary(principalFrn: string, policyName: string | null, context: IamChangeContext): Promise<void> {
    return this.boundaries.set(principalFrn, policyName, context);
  }

  getPermissionBoundary(principalFrn: string): Promise<string | null> {
    return this.boundaries.get(principalFrn);
  }

  attachGuardrail(policyName: string, context: IamChangeContext): Promise<void> {
    return this.guardrails.attach(policyName, context);
  }

  detachGuardrail(policyName: string, context: IamChangeContext): Promise<void> {
    return this.guardrails.detach(policyName, context);
  }

  listGuardrails(): Promise<string[]> {
    return this.guardrails.list();
  }

  // ---- groups ------------------------------------------------------------------

  createGroup(name: string, context: IamChangeContext): Promise<IamStoredGroup> {
    return this.groups.create(name, context);
  }

  getGroup(name: string): Promise<IamStoredGroup | null> {
    return this.groups.get(name);
  }

  listGroups(): Promise<IamStoredGroup[]> {
    return this.groups.list();
  }

  deleteGroup(name: string, context: IamChangeContext): Promise<void> {
    return this.groups.delete(name, context);
  }

  addUserToGroup(groupName: string, userId: string, context: IamChangeContext): Promise<void> {
    return this.groups.addUser(groupName, userId, context);
  }

  removeUserFromGroup(groupName: string, userId: string, context: IamChangeContext): Promise<void> {
    return this.groups.removeUser(groupName, userId, context);
  }

  // ---- roles -------------------------------------------------------------------

  /** Creates a role with a trust policy; `options.boundary` names a managed policy of kind `boundary`. */
  createRole(name: string, trustPolicy: unknown, context: IamChangeContext, options: { boundary?: string } = {}): Promise<IamStoredRole> {
    return this.roles.create(name, trustPolicy, context, options);
  }

  getRole(name: string): Promise<IamStoredRole | null> {
    return this.roles.get(name);
  }

  listRoles(): Promise<IamStoredRole[]> {
    return this.roles.list();
  }

  updateAssumeRolePolicy(name: string, trustPolicy: unknown, context: IamChangeContext): Promise<void> {
    return this.roles.updateTrustPolicy(name, trustPolicy, context);
  }

  deleteRole(name: string, context: IamChangeContext): Promise<void> {
    return this.roles.delete(name, context);
  }

  // ---- service identities --------------------------------------------------------

  createServiceIdentity(name: string, context: IamChangeContext): Promise<IamStoredServiceIdentity> {
    return this.serviceIdentities.create(name, context);
  }

  getServiceIdentity(name: string): Promise<IamStoredServiceIdentity | null> {
    return this.serviceIdentities.get(name);
  }

  listServiceIdentities(): Promise<IamStoredServiceIdentity[]> {
    return this.serviceIdentities.list();
  }

  deleteServiceIdentity(name: string, context: IamChangeContext): Promise<void> {
    return this.serviceIdentities.delete(name, context);
  }

  // ---- resolution ----------------------------------------------------------------

  /** Gathers every policy that applies to `principal`; see `IamPolicyResolver.resolve`. */
  resolvePolicySet(principal: IamPrincipal, options: { assumedRole?: string; sessionPolicies?: IamPolicy[] } = {}): Promise<IamPolicySet> {
    return this.resolver.resolve(principal, options);
  }
}
