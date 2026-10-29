// Test support for the authorizer: grammatical policies, a fake policy source
// that records what it was asked, and a recording audit sink.
import { IAM_POLICY_LANGUAGE_VERSION, parseIamPolicyDocument, type IamPolicyKind } from "@fluxiq/contracts/iam";
import type { IamStoredRole } from "../../store/index.ts";
import type { IamPolicy, IamPolicySet, IamPrincipal, IamRequestContext } from "../../types.ts";
import type { IamAuthorizeOptions } from "../authorize-options.ts";
import type { IamPolicySource } from "../policy-source.ts";

export const NOW_MS = Date.parse("2026-10-28T12:00:00Z");
export const WORKSPACE = "frn:fluxiq:platform::workspace/ws1";

export function policy(name: string, kind: IamPolicyKind, statements: readonly unknown[]): IamPolicy {
  const parsed = parseIamPolicyDocument({ Version: IAM_POLICY_LANGUAGE_VERSION, Statement: statements }, kind);
  if (!parsed.success) throw new Error(`test policy ${name} is not grammatical`);
  return { name, kind, document: parsed.data };
}

export function policySet(identity: IamPolicy[], parts: Partial<IamPolicySet> = {}): IamPolicySet {
  return { identity, guardrails: parts.guardrails ?? [], sessions: parts.sessions ?? [], boundary: parts.boundary ?? null };
}

export function principal(overrides: Partial<IamPrincipal> = {}): IamPrincipal {
  const type = overrides.type ?? "user";
  const id = overrides.id ?? "alice";
  return { type, id, workspaceId: "ws1", frn: overrides.frn ?? `frn:fluxiq:iam:ws1:${type}/${id}` };
}

export function context(overrides: Partial<IamRequestContext> = {}): IamRequestContext {
  return { workspaceId: "ws1", origin: "panel", currentTimeMs: NOW_MS, ...overrides };
}

export class FakePolicySource implements IamPolicySource {
  readonly resolveCalls: { principal: IamPrincipal; options: IamAuthorizeOptions | undefined }[] = [];
  failure: Error | null = null;
  roles = new Map<string, IamStoredRole>();

  constructor(private readonly resolve: (principal: IamPrincipal, options: IamAuthorizeOptions) => IamPolicySet) {}

  resolvePolicySet(principalArg: IamPrincipal, options?: IamAuthorizeOptions): Promise<IamPolicySet> {
    this.resolveCalls.push({ principal: principalArg, options });
    if (this.failure !== null) return Promise.reject(this.failure);
    return Promise.resolve(this.resolve(principalArg, options ?? {}));
  }

  getRole(name: string): Promise<IamStoredRole | null> {
    return Promise.resolve(this.roles.get(name) ?? null);
  }

  addRole(name: string, trust: IamPolicy): void {
    this.roles.set(name, { name, trustPolicy: trust.document, createdAtMs: NOW_MS });
  }
}
