/**
 * The policy variables at launch, bound when a policy compiles for a request.
 * They may appear in a `Resource` or `NotResource` pattern and in a string
 * condition's values, never in an action.
 */
export const IAM_POLICY_VARIABLES = Object.freeze(["${fluxiq:PrincipalId}", "${fluxiq:WorkspaceId}"] as const);

export type IamPolicyVariable = (typeof IAM_POLICY_VARIABLES)[number];

const VARIABLE_PATTERN = /\$\{[^}]*\}/gu;

/**
 * `text` with every known policy variable replaced by `replacement`, or null
 * when it holds an unknown variable or a stray `${`, `$` or `}`.
 */
export function replaceIamPolicyVariables(text: string, replacement: string): string | null {
  let unknown = false;
  const replaced = text.replace(VARIABLE_PATTERN, (variable) => {
    if (!(IAM_POLICY_VARIABLES as readonly string[]).includes(variable)) unknown = true;
    return replacement;
  });
  if (unknown || /[${}]/u.test(replaced)) return null;
  return replaced;
}
