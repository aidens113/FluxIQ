import { parseIamPolicyDocument, IAM_POLICY_LANGUAGE_VERSION } from "@fluxiq/contracts/iam";
import { iamActionListStatements, IAM_WORKSPACE_PATTERNS } from "../../../platform/iam/predefined/index.ts";
import type { IamPolicy } from "../../../platform/iam/index.ts";

/**
 * One registered action as the actor's permissions see it: the action, the
 * program that registered it, and whether the actor holds the permission that
 * registration requires. An `ops` action may be registered by several
 * programs, each with its own permission.
 */
export type ProgramPermissionGrant = {
  action: string;
  programId: string;
  held: boolean;
};

const WORKSPACE_RESOURCES = [IAM_WORKSPACE_PATTERNS.content, IAM_WORKSPACE_PATTERNS.workspace];

function pascal(programId: string): string {
  return programId
    .split("-")
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join("");
}

function statementsFor(grants: readonly ProgramPermissionGrant[]): unknown[] {
  const byAction = new Map<string, { held: string[]; total: number }>();
  for (const grant of grants) {
    const entry = byAction.get(grant.action) ?? { held: [], total: 0 };
    entry.total += 1;
    if (grant.held) entry.held.push(grant.programId);
    byAction.set(grant.action, entry);
  }
  const everywhere: string[] = [];
  const byProgram = new Map<string, string[]>();
  for (const [action, entry] of byAction) {
    if (entry.held.length === 0) continue;
    if (entry.held.length === entry.total) {
      everywhere.push(action);
      continue;
    }
    for (const programId of entry.held) byProgram.set(programId, [...(byProgram.get(programId) ?? []), action]);
  }
  const statements = iamActionListStatements("Permission", "Allow", everywhere, WORKSPACE_RESOURCES);
  for (const [programId, actions] of [...byProgram.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    statements.push(...iamActionListStatements(`Permission${pascal(programId)}`, "Allow", actions, [`frn:fluxiq:ops:\${fluxiq:WorkspaceId}:program/${programId}`]));
  }
  return statements;
}

/**
 * The policy that allows exactly what an actor's permissions allow today
 * (`actor.permissions.includes(registration.permission)`), as an identity or
 * a session policy.
 *
 * - `everything` (the actor holds every permission there is): one
 *   unconditional `Allow *` on the workspace's content and its FRN, a
 *   full-access grant, so an administrator keeps the list fast path.
 * - Otherwise each held action on the workspace's content and its FRN, except
 *   an action several programs register (only `ops` actions are) that the
 *   actor holds for some of them only: that one is allowed on those
 *   programs' own FRNs, so the decision stays per registration.
 * - Nothing held: one `Deny *`.
 *
 * Throws a `TypeError` for a document the grammar refuses (more than 100
 * statements), which the caller turns into a deny.
 */
export function programPermissionPolicy(name: string, kind: "identity" | "session", grants: readonly ProgramPermissionGrant[], everything: boolean): IamPolicy {
  const held = everything ? [{ Sid: "PermissionEverything", Effect: "Allow", Action: "*", Resource: WORKSPACE_RESOURCES }] : statementsFor(grants);
  const statements = held.length > 0 ? held : [{ Sid: "PermissionNone", Effect: "Deny", Action: "*", Resource: "*" }];
  const parsed = parseIamPolicyDocument({ Version: IAM_POLICY_LANGUAGE_VERSION, Id: name, Statement: statements }, kind);
  if (!parsed.success) throw new TypeError(`${name} is not a valid ${kind} policy: ${parsed.error.message}`);
  return { name, kind, document: parsed.data };
}
