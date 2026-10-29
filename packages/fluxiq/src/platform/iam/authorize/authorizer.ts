import { randomUUID } from "node:crypto";
import { compileIamPolicySet, iamTrustAllows } from "../evaluate/index.ts";
import { iamPrincipalFrn } from "../frn/index.ts";
import type { IamAuditSink, IamDecision, IamPolicy, IamPrincipal, IamRequestContext, IamResource } from "../types.ts";
import type { IamAuthorizeOptions } from "./authorize-options.ts";
import { denyIamRequest } from "./deny-decision.ts";
import type { IamPolicySource } from "./policy-source.ts";
import { recordIamDecision } from "./record-decision.ts";
import { IamRequestAuthorizer } from "./request-authorizer.ts";
import type { IamRoleSession } from "./role-session.ts";

const ASSUME_ROLE = "iam:AssumeRole";

/**
 * The IAM authorizer: `authorize(principal, action, resources, context)`
 * gathers the principal's policies, compiles them once, evaluates, and records
 * exactly one audit row.
 *
 * Fail closed: if gathering or compiling the policies fails (a store error, a
 * policy that will not compile), the result is a deny with its own audit row,
 * never a throw a caller could mistake for an allow. Only the audit sink
 * throwing propagates, and that is an error, not an allow.
 */
export class IamAuthorizer {
  constructor(
    private readonly source: IamPolicySource,
    private readonly sink: IamAuditSink
  ) {}

  /** Decides one request; see the class comment for failure behaviour. */
  async authorize(principal: IamPrincipal, action: string, resources: IamResource[], context: IamRequestContext, options: IamAuthorizeOptions = {}): Promise<IamDecision> {
    const request = await this.forRequest(principal, context, options);
    return request.decide(action, resources);
  }

  /** Gathers and compiles once for a request that makes several decisions or filters a list. */
  async forRequest(principal: IamPrincipal, context: IamRequestContext, options: IamAuthorizeOptions = {}): Promise<IamRequestAuthorizer> {
    const requestId = context.requestId ?? randomUUID();
    try {
      const set = await this.source.resolvePolicySet(principal, options);
      const compiled = compileIamPolicySet(set, principal, context.workspaceId);
      return new IamRequestAuthorizer(compiled, principal, context, this.sink, requestId);
    } catch {
      return new IamRequestAuthorizer(null, principal, context, this.sink, requestId);
    }
  }

  /**
   * Assumes a role. The role's trust policy must allow `caller`
   * (`iamTrustAllows`) and the caller's own policies must allow
   * `iam:AssumeRole` on the role. Either refusal, and any failure, is a
   * recorded deny: the identity check records its own row, a trust refusal
   * records one. The role-session principal's FRN is the role's FRN: the
   * contracts define no separate role-session FRN (open question, t784).
   */
  async assumeRole(caller: IamPrincipal, roleName: string, context: IamRequestContext, sessionPolicy?: IamPolicy): Promise<IamRoleSession> {
    const withId = { ...context, requestId: context.requestId ?? randomUUID() };
    let roleFrn: string;
    try {
      roleFrn = iamPrincipalFrn("role", caller.workspaceId, roleName);
    } catch {
      return this.refuse(caller, [{ frn: caller.frn }], withId);
    }
    const resource = { frn: roleFrn };
    try {
      const role = await this.source.getRole(roleName);
      if (role === null) return this.refuse(caller, [resource], withId);
      const trust: IamPolicy = { name: `${roleName}/trust`, kind: "trust", document: role.trustPolicy };
      if (iamTrustAllows(trust, caller, withId) === null) return this.refuse(caller, [resource], withId);
    } catch {
      return this.refuse(caller, [resource], withId);
    }
    const decision = await this.authorize(caller, ASSUME_ROLE, [resource], withId);
    if (decision.decision === "deny") return { allowed: false, decision };
    const principal: IamPrincipal = { type: "role", id: roleName, workspaceId: caller.workspaceId, frn: roleFrn };
    const options: IamAuthorizeOptions = { assumedRole: roleName, sessionPolicies: sessionPolicy === undefined ? [] : [sessionPolicy] };
    return { allowed: true, principal, options };
  }

  private refuse(caller: IamPrincipal, resources: IamResource[], context: IamRequestContext): IamRoleSession {
    const decision = denyIamRequest(caller, ASSUME_ROLE, resources);
    recordIamDecision(this.sink, decision, context, context.requestId ?? randomUUID());
    return { allowed: false, decision };
  }
}
