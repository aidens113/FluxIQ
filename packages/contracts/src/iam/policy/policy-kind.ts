/**
 * What a policy document is for, which decides the grammar rules it is held
 * to beyond the common ones:
 *
 * - `identity`: attached to a user, group, role or service identity;
 * - `session`: narrows a principal for one session (`FluxIQBrowserSession`, or
 *   the optional policy passed when assuming a role);
 * - `boundary`: the most an organisation's delegated administrators can grant;
 * - `guardrail`: deny-only, set by the profile or an organisation, applies to
 *   every principal in the workspace (no `Allow` statement);
 * - `trust`: a role's trust policy, saying who may assume it. Every statement
 *   names a `Principal`, allows only `iam:AssumeRole`, and has no `Resource`.
 *
 * Only a trust policy may carry `Principal`.
 */
export const IAM_POLICY_KINDS = Object.freeze(["identity", "session", "boundary", "guardrail", "trust"] as const);

export type IamPolicyKind = (typeof IAM_POLICY_KINDS)[number];
