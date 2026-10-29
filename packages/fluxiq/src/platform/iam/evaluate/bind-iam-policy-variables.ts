import { IAM_POLICY_VARIABLES, type IamPolicyVariable } from "@fluxiq/contracts/iam";
import type { IamVariableBindings } from "./types.ts";

const VARIABLE_PATTERN = /\$\{[^}]*\}/gu;

function isPolicyVariable(text: string): text is IamPolicyVariable {
  return (IAM_POLICY_VARIABLES as readonly string[]).includes(text);
}

/**
 * `text` with every policy variable replaced by its bound value, taken
 * literally. Null when a variable is unknown or bound to null: the text then
 * stands for no value at all, so whatever it is compared with never matches.
 */
export function bindIamPolicyVariables(text: string, bindings: IamVariableBindings): string | null {
  let unbound = false;
  const bound = text.replace(VARIABLE_PATTERN, (variable) => {
    const value = isPolicyVariable(variable) ? bindings[variable] : null;
    if (value === null) unbound = true;
    return value ?? "";
  });
  return unbound ? null : bound;
}
