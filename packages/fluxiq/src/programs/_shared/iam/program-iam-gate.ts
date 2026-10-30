import type { FluxIQRequestOrigin } from "@fluxiq/contracts/iam";
import type { FluxIQProfile } from "@fluxiq/contracts/platform";
import { IamRequestAuthorizer, type IamPolicySource } from "../../../platform/iam/authorize/index.ts";
import { compileIamPolicySet, type CompiledIamPolicySet } from "../../../platform/iam/evaluate/index.ts";
import { iamPrincipalFrn, iamWorkspaceFrn } from "../../../platform/iam/frn/index.ts";
import { IAM_SERVICE_GUARDRAIL, resolveIamPredefinedPolicy } from "../../../platform/iam/predefined/index.ts";
import type { IamAuditSink, IamPolicy, IamPolicySet, IamPrincipal, IamRequestContext, IamResource } from "../../../platform/iam/index.ts";
import { rolePolicyNames } from "../../identity-access/runtime/roles.ts";
import type { Permission } from "../../identity-access/index.ts";
import type { ProgramApiActor } from "../api.ts";
import { describeProgramResource } from "./describe-resource.ts";
import { programIamIdSegment } from "./id-segment.ts";
import { programPermissionPolicy, type ProgramPermissionGrant } from "./permission-policy.ts";
import type { ProgramApiIamOptions } from "./registry-iam-types.ts";
import type { ProgramOwnedResourceKind, ProgramResourceOwnerResolver, ProgramResourceRef } from "./types.ts";

/** One registration's action, program and permission: what the permission policies are built from. */
export type ProgramIamRegisteredAction = {
  action: string;
  programId: string;
  permission: Permission;
};

/** The decisions of one call: one compiled set, one request id, one context. */
export type ProgramIamRequest = {
  authorizer: IamRequestAuthorizer;
  compiled: CompiledIamPolicySet;
  /** Owners are looked up only where a decision can depend on them (`service`). */
  resolveOwners: boolean;
  actorUserId: string;
};

/** An app route's action, decided by the route's own permission rather than a registration's. */
export type ProgramIamActionOverride = {
  action: string;
  permission: Permission;
};

// Every permission there is. A Record over the union, so adding a permission
// without listing it here is a compile error.
const PERMISSIONS: Readonly<Record<Permission, true>> = {
  "programs.read": true,
  "programs.write": true,
  "flows.write": true,
  "runtime.control": true,
  "compute.control": true,
  "identity.manage": true,
  "data.manage": true,
  "secrets.manage": true
};
const EVERY_PERMISSION = Object.keys(PERMISSIONS) as Permission[];

const IDENTITY_POLICY = "FluxIQPermissions";
const SESSION_POLICY = "FluxIQPermissionSession";
const CACHE_LIMIT = 256;

const NO_POLICIES: IamPolicySet = Object.freeze({ identity: [], guardrails: [], sessions: [], boundary: null });

const DISCARD: IamAuditSink = Object.freeze({
  record: () => undefined,
  flush: async () => undefined
});

/**
 * Turns a program API actor into IAM decisions for `GlobalProgramApiRegistry`.
 *
 * - `local`, `self-hosted`: identity is the role's predefined policies
 *   (`rolePolicyNames`) plus `FluxIQPermissions`, an inline policy allowing
 *   exactly the actions whose registered permission the actor holds; the
 *   session policy `FluxIQPermissionSession` allows the same. Identity can then
 *   never allow less than the permissions do (an edited role, a `user` role),
 *   and the session never more (a paired client's narrowed permissions), so
 *   every decision equals `permissions.includes` by construction. These sets
 *   depend only on the actor and the registrations, so they are compiled once
 *   and cached; registering an endpoint clears the cache.
 * - `service`: the policies `source` attaches to `user/<userId>`, plus
 *   `FluxIQServiceGuardrail`, plus the permission session for a paired
 *   client only. No source denies everything. Never cached: attachments change.
 */
export class ProgramIamGate {
  private readonly profile: FluxIQProfile;
  private readonly workspaceId: string;
  private readonly source: IamPolicySource | undefined;
  private readonly sink: IamAuditSink;
  private readonly compiledSets = new Map<string, CompiledIamPolicySet>();
  private requests = 0;

  constructor(
    options: ProgramApiIamOptions,
    private readonly registered: () => readonly ProgramIamRegisteredAction[],
    private readonly owners: ReadonlyMap<ProgramOwnedResourceKind, ProgramResourceOwnerResolver>
  ) {
    this.profile = options.profile ?? "local";
    this.workspaceId = options.workspaceId ?? "workspace-main";
    iamWorkspaceFrn(this.workspaceId);
    this.source = options.source;
    this.sink = options.audit ?? DISCARD;
  }

  /** Drops every cached set; the registry calls it when a registration is added. */
  invalidate(): void {
    this.compiledSets.clear();
  }

  /** Gathers and compiles the actor's policies for one call. A failure is a set that denies everything, never a throw. */
  async open(actor: ProgramApiActor, origin?: FluxIQRequestOrigin, override?: ProgramIamActionOverride): Promise<ProgramIamRequest> {
    const id = programIamIdSegment(actor.userId).segment;
    const principal: IamPrincipal = { type: "user", id, workspaceId: this.workspaceId, frn: iamPrincipalFrn("user", this.workspaceId, id) };
    this.requests = (this.requests + 1) % 1000;
    const requestId = `${Date.now()}${String(this.requests).padStart(3, "0")}`;
    const context: IamRequestContext = {
      workspaceId: this.workspaceId,
      origin: origin ?? (actor.channel === "paired-client" ? "extension-chat" : "panel"),
      currentTimeMs: Date.now(),
      profile: this.profile,
      requestId
    };
    const compiled = await this.compiledFor(actor, principal, override);
    return { authorizer: new IamRequestAuthorizer(compiled, principal, context, this.sink, requestId), compiled, resolveOwners: this.profile === "service", actorUserId: actor.userId };
  }

  /**
   * The refs as IAM resources. Owners are looked up only under `service`, and
   * not even there when the set's full-access grant covers every resource
   * (the owner cannot change that decision). A resolver that throws fails the
   * call; it is never read as "no owner".
   */
  async resources(request: ProgramIamRequest, refs: readonly ProgramResourceRef[], programId: string): Promise<IamResource[]> {
    const scope = { workspaceId: this.workspaceId, programId, actorUserId: request.actorUserId };
    const described = refs.map((ref) => describeProgramResource(ref, scope));
    const compiled = request.compiled;
    const covered = compiled.fullAccess && described.every((item) => compiled.coveredByFullAccess(item.frn));
    return Promise.all(described.map(async (item): Promise<IamResource> => {
      if ("userId" in item.owner) return { frn: item.frn, ownerId: item.owner.userId };
      if (!request.resolveOwners || covered) return { frn: item.frn };
      const resolver = this.owners.get(item.owner.lookup);
      const owner = programIamIdSegment(resolver === undefined ? null : await resolver.ownerOf(item.owner.id));
      return { frn: item.frn, ownerId: owner.raw === null ? null : owner.segment };
    }));
  }

  private async compiledFor(actor: ProgramApiActor, principal: IamPrincipal, override: ProgramIamActionOverride | undefined): Promise<CompiledIamPolicySet> {
    if (this.profile === "service") return this.compiledServiceSet(actor, principal, override);
    const key = [actor.userId, actor.roleId, [...new Set(actor.permissions)].sort().join(","), override === undefined ? "" : `${override.action}=${String(actor.permissions.includes(override.permission))}`].join("\u0001");
    const cached = this.compiledSets.get(key);
    if (cached !== undefined) return cached;
    const compiled = this.compileOrDeny(() => this.staticSet(actor, override), principal);
    if (this.compiledSets.size >= CACHE_LIMIT) this.compiledSets.delete(this.compiledSets.keys().next().value ?? key);
    this.compiledSets.set(key, compiled);
    return compiled;
  }

  private async compiledServiceSet(actor: ProgramApiActor, principal: IamPrincipal, override: ProgramIamActionOverride | undefined): Promise<CompiledIamPolicySet> {
    const source = this.source;
    if (source === undefined) return compileIamPolicySet(NO_POLICIES, principal, this.workspaceId);
    let resolved: IamPolicySet;
    try {
      resolved = await source.resolvePolicySet(principal);
    } catch {
      // Fail closed, as `IamAuthorizer.forRequest` does: an unreadable store
      // is a set that allows nothing, and each decision records its deny.
      return compileIamPolicySet(NO_POLICIES, principal, this.workspaceId);
    }
    return this.compileOrDeny(() => {
      const guardrails = resolved.guardrails.some((policy) => policy.name === IAM_SERVICE_GUARDRAIL.name) ? resolved.guardrails : [...resolved.guardrails, IAM_SERVICE_GUARDRAIL];
      const sessions = actor.channel === "paired-client" ? [...resolved.sessions, this.permissionPolicy(SESSION_POLICY, "session", actor, override)] : resolved.sessions;
      return { ...resolved, guardrails, sessions };
    }, principal);
  }

  private staticSet(actor: ProgramApiActor, override: ProgramIamActionOverride | undefined): IamPolicySet {
    const predefined = (rolePolicyNames(actor.roleId) ?? []).map((name) => resolveIamPredefinedPolicy(name)).filter((policy): policy is IamPolicy => policy !== null);
    return {
      identity: [...predefined, this.permissionPolicy(IDENTITY_POLICY, "identity", actor, override)],
      guardrails: [],
      sessions: [this.permissionPolicy(SESSION_POLICY, "session", actor, override)],
      boundary: null
    };
  }

  private permissionPolicy(name: string, kind: "identity" | "session", actor: ProgramApiActor, override: ProgramIamActionOverride | undefined): IamPolicy {
    const holds = (permission: Permission): boolean => actor.permissions.includes(permission);
    const grants: ProgramPermissionGrant[] = this.registered()
      .filter((registration) => registration.action !== override?.action)
      .map((registration) => ({ action: registration.action, programId: registration.programId, held: holds(registration.permission) }));
    if (override !== undefined) grants.push({ action: override.action, programId: "", held: holds(override.permission) });
    return programPermissionPolicy(name, kind, grants, EVERY_PERMISSION.every(holds));
  }

  // A set that will not build or compile (a policy the grammar refuses)
  // allows nothing: each decision then records an implicit deny, as the
  // authorizer's own fail-closed path does.
  private compileOrDeny(build: () => IamPolicySet, principal: IamPrincipal): CompiledIamPolicySet {
    try {
      return compileIamPolicySet(build(), principal, this.workspaceId);
    } catch {
      return compileIamPolicySet(NO_POLICIES, principal, this.workspaceId);
    }
  }
}
