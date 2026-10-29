import { bindIamPolicyVariables } from "../bind-iam-policy-variables.ts";
import type { IamVariableBindings } from "../types.ts";

// A variable, a wildcard, a run of ordinary characters, or a stray `$`.
const TOKEN_PATTERN = /\$\{[^}]*\}|[*?]|[^*?$]+|\$/gu;
// The characters a `u`-flag regular expression treats as syntax. `-` is not
// among them outside a class, and escaping it there is a syntax error.
const REGEXP_SYNTAX = /[\\^$.*+?()[\]{}|/]/gu;
const ANY_RUN = "[\\s\\S]*";
const ANY_ONE = "[\\s\\S]";

function escapeRegExp(text: string): string {
  return text.replace(REGEXP_SYNTAX, "\\$&");
}

function patternPiece(token: string, bindings: IamVariableBindings | null): string | null {
  if (token === "*") return ANY_RUN;
  if (token === "?") return ANY_ONE;
  if (bindings === null || !token.startsWith("${")) return escapeRegExp(token);
  const bound = bindIamPolicyVariables(token, bindings);
  return bound === null ? null : escapeRegExp(bound);
}

/**
 * An anchored regular expression for one IAM wildcard pattern, AWS style: `*`
 * is any run of characters (possibly empty, crossing `:` and `/`), `?` is
 * exactly one, and everything else is literal. With `bindings`, each policy
 * variable becomes its bound value, literally (a bound `.` or `*` is never a
 * wildcard); a variable that is unknown or bound to null makes the whole
 * pattern match nothing, returned as null. With `bindings` null (action
 * patterns, which hold no variables) `$` is an ordinary character.
 */
export function compileIamPattern(pattern: string, bindings: IamVariableBindings | null, caseInsensitive: boolean): RegExp | null {
  let source = "";
  for (const [token] of pattern.matchAll(TOKEN_PATTERN)) {
    const piece = patternPiece(token, bindings);
    if (piece === null) return null;
    source += piece;
  }
  return new RegExp(`^${source}$`, caseInsensitive ? "iu" : "u");
}
