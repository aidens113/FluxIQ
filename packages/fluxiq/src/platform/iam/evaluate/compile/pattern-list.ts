import { compileIamPattern } from "./pattern.ts";
import type { IamVariableBindings } from "../types.ts";

/**
 * A predicate for one policy element (`Action`, `Resource`, a trust
 * `Principal`...): true when any of its patterns matches. Each pattern
 * compiles once; one that needs an unbound variable drops out, since it
 * matches nothing.
 */
export function compileIamPatternList(element: string | readonly string[], bindings: IamVariableBindings | null, caseInsensitive: boolean): (value: string) => boolean {
  const entries = typeof element === "string" ? [element] : element;
  if (entries.includes("*")) return () => true;
  const patterns = entries.map((entry) => compileIamPattern(entry, bindings, caseInsensitive)).filter((pattern): pattern is RegExp => pattern !== null);
  return (value) => patterns.some((pattern) => pattern.test(value));
}
