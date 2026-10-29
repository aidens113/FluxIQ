import type { IamPolicyKind } from "@fluxiq/contracts/iam";
import type { IamPolicy, IamPolicySet, IamPrincipal } from "../../types.ts";
import type { IamBoundaryStore, IamGuardrailStore, IamInlineStore, IamAttachmentStore } from "../attachments/index.ts";
import type { IamStoreScope } from "../context/index.ts";
import { IamStoreError } from "../errors/index.ts";
import { parsePrincipalFrn } from "../parse/index.ts";
import type { IamPolicyStore } from "../policies/index.ts";
import type { IamGroupStore, IamRoleStore } from "../principals/index.ts";

/** What the resolver reads from the other collaborators. */
export type IamPolicyResolverSources = {
  policies: IamPolicyStore;
  attachments: IamAttachmentStore;
  inline: IamInlineStore;
  boundaries: IamBoundaryStore;
  guardrails: IamGuardrailStore;
  groups: IamGroupStore;
  roles: IamRoleStore;
};

/** Gathers the `IamPolicySet` that applies to a principal. */
export class IamPolicyResolver {
  private readonly scope: IamStoreScope;
  private readonly sources: IamPolicyResolverSources;

  constructor(scope: IamStoreScope, sources: IamPolicyResolverSources) {
    this.scope = scope;
    this.sources = sources;
  }

  /**
   * Gathers every policy that applies to `principal`: its own attached and inline
   * policies, those of every group a user belongs to, and those of the assumed
   * role; the workspace guardrails; the session policies passed in; and the
   * boundary of the assumed role, or of the principal when no role is assumed.
   * An attached name that resolves nowhere, or to the wrong kind, throws: a
   * policy is never silently dropped or granted.
   */
  async resolve(principal: IamPrincipal, options: { assumedRole?: string; sessionPolicies?: IamPolicy[] } = {}): Promise<IamPolicySet> {
    if (principal.workspaceId !== this.scope.workspaceId) {
      throw new IamStoreError("workspace_mismatch", `${principal.frn} belongs to a different workspace than this store.`);
    }
    const holders = [principal.frn];
    if (principal.type === "user") {
      for (const group of await this.sources.groups.list()) {
        if (group.members.includes(principal.id)) holders.push(this.scope.principalFrn("group", group.name));
      }
    }
    let boundaryOwner = principal.frn;
    if (options.assumedRole !== undefined) {
      const role = await this.sources.roles.require(options.assumedRole);
      boundaryOwner = this.scope.principalFrn("role", role.name);
      holders.push(boundaryOwner);
    }
    const identity = await this.gatherIdentity(holders);
    const guardrails: IamPolicy[] = [];
    for (const name of await this.sources.guardrails.list()) guardrails.push(await this.resolveAttached(name, "guardrail"));
    const boundaryName = await this.sources.boundaries.get(boundaryOwner);
    const boundary = boundaryName === null ? null : await this.resolveAttached(boundaryName, "boundary");
    return { identity, guardrails, sessions: options.sessionPolicies ?? [], boundary };
  }

  private async gatherIdentity(holders: readonly string[]): Promise<IamPolicy[]> {
    const identity: IamPolicy[] = [];
    const seen = new Set<string>();
    for (const holder of holders) {
      for (const name of await this.sources.attachments.list(holder)) {
        if (seen.has(name)) continue;
        seen.add(name);
        identity.push(await this.resolveAttached(name, "identity"));
      }
      const reference = parsePrincipalFrn(holder, this.scope.workspaceId);
      for (const inline of await this.sources.inline.list(holder)) {
        identity.push({ name: `inline:${reference.type}/${reference.id}/${inline.name}`, kind: "identity", document: inline.document });
      }
    }
    return identity;
  }

  private async resolveAttached(name: string, kind: IamPolicyKind): Promise<IamPolicy> {
    const predefined = this.scope.resolveManagedPolicy(name);
    if (predefined !== null) return this.expectKind(predefined, kind);
    const stored = await this.sources.policies.get(name);
    if (stored === null) {
      throw new IamStoreError("unresolvable_policy", `Attached policy ${name} is neither predefined nor customer-managed here.`);
    }
    const version = stored.versions.find((candidate) => candidate.id === stored.defaultVersionId);
    if (version === undefined) throw new IamStoreError("corrupt_record", `Policy ${name} has no default version ${stored.defaultVersionId}.`);
    return this.expectKind({ name, kind: stored.kind, document: version.document }, kind);
  }

  private expectKind(policy: IamPolicy, kind: IamPolicyKind): IamPolicy {
    if (policy.kind === kind) return policy;
    throw new IamStoreError("policy_kind_mismatch", `Policy ${policy.name} is a ${policy.kind} policy; a ${kind} policy was expected.`);
  }
}
