import type { IamPolicyStatement } from "@fluxiq/contracts/iam";

/** The workspace-wide resource pattern a full-access statement may name instead of `*`. */
const WORKSPACE_WIDE = "frn:fluxiq:*:${fluxiq:WorkspaceId}:*";

function entries(element: string | readonly string[]): readonly string[] {
  return typeof element === "string" ? [element] : element;
}

/**
 * True for an unconditional full-access grant: `Allow`, no `Condition`, an
 * `Action` listing `*`, and a `Resource` listing `*` or (with a workspace to
 * bind) `frn:fluxiq:*:${fluxiq:WorkspaceId}:*`. `NotAction` and `NotResource`
 * never qualify. The workspace pattern does not match the workspace's own FRN
 * (`frn:fluxiq:platform::workspace/<id>`, whose workspace segment is empty); a
 * full-access policy that should cover top-level creates and lists names that
 * FRN too, or `*`.
 */
export function isIamFullAccessStatement(statement: IamPolicyStatement, workspaceId: string | null): boolean {
  if (statement.Effect !== "Allow" || statement.Condition !== undefined) return false;
  if (statement.Action === undefined || statement.Resource === undefined) return false;
  if (statement.NotAction !== undefined || statement.NotResource !== undefined) return false;
  if (!entries(statement.Action).includes("*")) return false;
  const resources = entries(statement.Resource);
  return resources.includes("*") || (workspaceId !== null && resources.includes(WORKSPACE_WIDE));
}
