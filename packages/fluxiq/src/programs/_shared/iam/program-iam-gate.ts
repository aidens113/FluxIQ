import type { FluxIQRequestOrigin } from "@fluxiq/contracts/iam";
import type { FluxIQProfile } from "@fluxiq/contracts/platform";
import { IamRequestAuthorizer, type IamPolicySource } from "../../../platform/iam/authorize/index.ts";
import { compileIamPolicySet, type CompiledIamPolicySet } from "../../../platform/iam/evaluate/index.ts";
import { iamPrincipalFrn, iamWorkspaceFrn } from "../../../platform/iam/frn/index.ts";
import { IAM_CONNECTED_SESSION, IAM_SERVICE_GUARDRAIL, resolveIamPredefinedPolicy } from "../../../platform/iam/predefined/index.ts";
import { iamStoreChanges } from "../../../platform/iam/store/index.ts";
import type { IamAuditSink, IamPolicy, IamPolicySet, IamPrincipal, IamRequestConsent, IamRequestContext, IamRequestVia, IamResource } from "../../../platform/iam/index.ts";
import { rolePolicyNames } from "../../identity-access/runtime/roles.ts";
import type { Permission } from "../../identity-access/index.ts";
import type { ProgramApiActor } from "../api.ts";
import { describeProgramResource } from "./describe-resource.ts";
import { programIamIdSegment } from "./id-segment.ts";
import { programPermissionPolicy, type ProgramPermissionGrant } from "./permission-policy.ts";
import type { ProgramApiIamOptions } from "./registry-iam-types.ts";
import type { ProgramResourceOwnerResolver } from "../../../framework/persistence/resource-owner/owner-resolver.ts";
import type { ProgramOwnedResourceKind, ProgramResourceRef } from "./types.ts";

/** One registration's action, program and permission: what the permission policies are built from. */
export type ProgramIamRegisteredAction = {
  action: string;
  programId: string;
  permission: Permission;
};

/** The decisions of one call: one compiled set, one request id, one context. */
export type ProgramIamRequest = {
  authorizer: IamRequestAuthorizer;
  compiled: CompiledIamPolicySet | null;
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

type PreparedPolicies = { available: true; compiled: CompiledIamPolicySet } | { available: false };

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
 *   `FluxIQServiceGuardrail`, plus `FluxIQBrowserSession` as the session
 *   policy of a paired client only (t950). A paired browser is decided by its
 *   person's policies narrowed by that session policy, never by the legacy
 *   identity role its person maps to (a hosted member is `viewer`, which would
 *   leave their browser read-only whatever their policies allow). Which
 *   endpoints a token names at all stays the paired program route's allowlist.
 *   No source denies everything. Never cached: attachments change.
 */
export class ProgramIamGate {
  private readonly profile: FluxIQProfile;
  private readonly workspaceId: string;
  private readonly source: IamPolicySource | undefined;
  private readonly sink: IamAuditSink;
  private readonly compiledSets = new Map<string, CompiledIamPolicySet>();
  private readonly changeListeners = new Set<() => void>();
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

  /** Drops every cached set; the registry calls it when a registration is added. Decisions made before may now differ, so holders are told. */
  invalidate(): void {
    this.compiledSets.clear();
    for (const listener of [...this.changeListeners]) listener();
  }

  /**
   * Tells `listener` whenever a decision this gate made may since have
   * changed: a registration was added (the permission policies are built from
   * them), or a write to an IAM store of this gate's workspace or of the
   * platform level (`iamStoreChanges`), where `service` reads its policies.
   * Who the actor is (their role, whether they are enabled) is the caller's to
   * watch. Returns the function that stops it.
   */
  subscribeChanges(listener: () => void): () => void {
    this.changeListeners.add(listener);
    const stopStore = iamStoreChanges.subscribe((workspaceId) => {
      if (workspaceId === null || workspaceId === this.workspaceId) listener();
    });
    return () => {
      this.changeListeners.delete(listener);
      stopStore();
    };
  }

  /**
   * Gathers and compiles the actor's policies for one call. A failure is null
   * and produces a marked unavailable denial, never an allow. `via` names who made the call on
   * the actor's behalf (the panel assistant); it is written to every audit row
   * of the call and decides nothing. `consent` is how the person consented to
   * the act a press grant confirms (a mint, or the call it confirms); it is
   * written the same way and decides nothing either.
   */
  async open(actor: ProgramApiActor, origin?: FluxIQRequestOrigin, override?: ProgramIamActionOverride, via?: IamRequestVia, consent?: IamRequestConsent): Promise<ProgramIamRequest> {
    const type = actor.serviceIdentity === undefined ? "user" : "service-identity";
    const id = programIamIdSegment(actor.serviceIdentity?.id ?? actor.userId).segment;
    const principal: IamPrincipal = { type, id, workspaceId: this.workspaceId, frn: iamPrincipalFrn(type, this.workspaceId, id) };
    this.requests = (this.requests + 1) % 1000;
    const requestId = `${Date.now()}${String(this.requests).padStart(3, "0")}`;
    const context: IamRequestContext = {
      workspaceId: this.workspaceId,
      origin: origin ?? (actor.channel === "paired-client" ? "extension-chat" : "panel"),
      currentTimeMs: Date.now(),
      profile: this.profile,
      requestId,
      ...(via === undefined ? {} : { via }),
      ...(consent === undefined ? {} : { consent })
    };
    const prepared = await this.compiledFor(actor, principal, override);
    const compiled = prepared.available ? prepared.compiled : null;
    return { authorizer: new IamRequestAuthorizer(compiled, principal, context, this.sink, requestId), compiled, resolveOwners: this.profile === "service", actorUserId: actor.serviceIdentity?.id ?? actor.userId };
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
    if (compiled === null) return described.map((item) => ({ frn: item.frn }));
    const covered = compiled.fullAccess && described.every((item) => compiled.coveredByFullAccess(item.frn));
    return Promise.all(described.map(async (item): Promise<IamResource> => {
      if ("userId" in item.owner) return { frn: item.frn, ownerId: item.owner.userId };
      if (!request.resolveOwners || covered) return { frn: item.frn };
      const resolver = this.owners.get(item.owner.lookup);
      const owner = programIamIdSegment(resolver === undefined ? null : await resolver.ownerOf(item.owner.id));
      return { frn: item.frn, ownerId: owner.raw === null ? null : owner.segment };
    }));
  }

  private async compiledFor(actor: ProgramApiActor, principal: IamPrincipal, override: ProgramIamActionOverride | undefined): Promise<PreparedPolicies> {
    // A lease's resources change between calls of the same machine. Never
    // reuse a person/role cache entry or a policy from its previous lease.
    if (actor.serviceIdentity !== undefined) return this.compiledMachineSet(actor, principal);
    if (this.profile === "service") return this.compiledServiceSet(actor, principal);
    const key = [actor.userId, actor.roleId, [...new Set(actor.permissions)].sort().join(","), override === undefined ? "" : `${override.action}=${String(actor.permissions.includes(override.permission))}`].join("\u0001");
    const cached = this.compiledSets.get(key);
    if (cached !== undefined) return { available: true, compiled: cached };
    const compiled = this.compileOrDeny(() => this.staticSet(actor, override), principal);
    if (this.compiledSets.size >= CACHE_LIMIT) this.compiledSets.delete(this.compiledSets.keys().next().value ?? key);
    if (compiled.available) this.compiledSets.set(key, compiled.compiled);
    return compiled;
  }

  private async compiledMachineSet(actor: ProgramApiActor, principal: IamPrincipal): Promise<PreparedPolicies> {
    try {
      if (!actor.serviceIdentity || (this.profile === "service" && this.source === undefined)) return { available: true, compiled: compileIamPolicySet(NO_POLICIES, principal, this.workspaceId) };
      const inherited = this.source === undefined ? NO_POLICIES : await this.source.resolvePolicySet(principal);
      const identity: IamPolicy = { name: "FluxIQManagedHost", kind: "identity", document: actor.serviceIdentity.policy };
      const session: IamPolicy = { name: "FluxIQManagedHostLease", kind: "session", document: actor.serviceIdentity.policy };
      const guardrails = this.profile === "service" && !inherited.guardrails.some((policy) => policy.name === IAM_SERVICE_GUARDRAIL.name)
        ? [...inherited.guardrails, IAM_SERVICE_GUARDRAIL] : inherited.guardrails;
      return this.compileOrDeny(() => ({ ...inherited, identity: [...inherited.identity, identity], guardrails, sessions: [...inherited.sessions, session] }), principal);
    } catch {
      return { available: false };
    }
  }

  private async compiledServiceSet(actor: ProgramApiActor, principal: IamPrincipal): Promise<PreparedPolicies> {
    const source = this.source;
    if (source === undefined) return { available: true, compiled: compileIamPolicySet(NO_POLICIES, principal, this.workspaceId) };
    let resolved: IamPolicySet;
    try {
      resolved = await source.resolvePolicySet(principal);
    } catch {
      // Preserve unavailable authority for the request authorizer; a real
      // empty policy set remains an ordinary denial, not an outage.
      return { available: false };
    }
    return this.compileOrDeny(() => {
      const guardrails = resolved.guardrails.some((policy) => policy.name === IAM_SERVICE_GUARDRAIL.name) ? resolved.guardrails : [...resolved.guardrails, IAM_SERVICE_GUARDRAIL];
      const pairedSession = actor.channel === "paired-client" && !resolved.sessions.some((policy) => policy.name === IAM_CONNECTED_SESSION.name);
      const sessions = pairedSession ? [...resolved.sessions, IAM_CONNECTED_SESSION] : resolved.sessions;
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
  // stays unavailable: each decision denies with the same safe failure
  // discriminator as the authorizer's own fail-closed path.
  private compileOrDeny(build: () => IamPolicySet, principal: IamPrincipal): PreparedPolicies {
    try {
      return { available: true, compiled: compileIamPolicySet(build(), principal, this.workspaceId) };
    } catch {
      return { available: false };
    }
  }
}
