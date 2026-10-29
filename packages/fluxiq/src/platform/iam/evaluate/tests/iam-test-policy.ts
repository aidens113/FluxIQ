// Test support for the evaluator: policies that went through the frozen
// grammar (so every vector is a document the store could really hold), and
// the default principal and request.
import { IAM_POLICY_LANGUAGE_VERSION, parseIamPolicyDocument, type IamPolicyKind } from "@fluxiq/contracts/iam";
import type { IamPolicy, IamPolicySet, IamPrincipal, IamRequestContext } from "../../types.ts";

export const NOW_MS = Date.parse("2026-10-28T12:00:00Z");

/** A parsed policy of `kind`; throws with the grammar's refusals when a statement is not grammatical. */
export function testPolicy(name: string, kind: IamPolicyKind, statements: readonly unknown[]): IamPolicy {
  const parsed = parseIamPolicyDocument({ Version: IAM_POLICY_LANGUAGE_VERSION, Statement: statements }, kind);
  if (!parsed.success) throw new Error(`test policy ${name} is not grammatical: ${JSON.stringify(parsed.error.issues)}`);
  return { name, kind, document: parsed.data };
}

export function testPolicySet(parts: Partial<IamPolicySet>): IamPolicySet {
  return { identity: parts.identity ?? [], guardrails: parts.guardrails ?? [], sessions: parts.sessions ?? [], boundary: parts.boundary ?? null };
}

export function testPrincipal(overrides: Partial<IamPrincipal> = {}): IamPrincipal {
  const type = overrides.type ?? "user";
  const id = overrides.id ?? "alice";
  const workspaceId = overrides.workspaceId === undefined ? "ws1" : overrides.workspaceId;
  return { type, id, workspaceId, frn: overrides.frn ?? `frn:fluxiq:iam:${workspaceId ?? ""}:${type}/${id}` };
}

export function testContext(overrides: Partial<IamRequestContext> = {}): IamRequestContext {
  return { workspaceId: "ws1", origin: "panel", currentTimeMs: NOW_MS, ...overrides };
}
