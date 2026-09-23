// The one step key that is not a parameter: what the step's own action would
// lastingly do.
//
// A step that presses something has to be able to say what pressing it would
// cause, because that is the only fact in the permission seam nobody but the
// model holds. Core holds the person's grant and has never seen the page; the
// domain knows which control the step acts on and not what pressing it means on
// this site. Without somewhere to write it, the refusal that asks for it cannot
// be answered, and a build that met one died on `bootstrap.unknown_parameter`
// having written exactly the right line (`run-mud7fssy-902f877b`,
// `run-mud7p1wg-3049531f`).
//
// It is a reserved word rather than a parameter because no node declares it: it
// is a statement about the step, not a value the node runs with. There is one
// precedent in the same two readers -- `OUTPUT_ACTION_WORDS` -- and this follows
// it exactly, so a reader that already knows to look past a reserved key learns
// one more rather than a new mechanism.
//
// Nothing here knows what a consequence class is. The vocabulary belongs to
// `runtime/action-permissions/`, which validates it fail-closed; this module
// only bounds the shape, so a declaration that is not one is refused there
// rather than silently read as nothing.

import { authoringKey } from "./keys.ts";

/** How the step key may be spelled. Compared through `authoringKey`. */
const CONSEQUENCE_WORDS = new Set(["consequences", "consequence"]);

/** How many classes one step may declare, and how long each may be. */
const MAX_CONSEQUENCES = 10;
const MAX_CONSEQUENCE_LENGTH = 40;

/** Whether a single-segment step key is the consequence declaration. */
export function isAuthoringConsequenceKey(key: string): boolean {
  return CONSEQUENCE_WORDS.has(authoringKey(key));
}

/**
 * The classes a declaration names, bounded, or `undefined` when what was
 * written is not a declaration at all.
 *
 * `none` and an empty value are a declaration that the step causes nothing
 * lasting, which is a different statement from having said nothing, and the
 * two must stay distinguishable: `[]` is the first, `undefined` the second.
 */
export function readAuthoringConsequences(value: unknown): string[] | undefined {
  const words = Array.isArray(value)
    ? value.map((item) => (typeof item === "string" ? item : undefined))
    : typeof value === "string" ? value.split(",") : undefined;
  if (!words) return undefined;
  if (words.some((word) => word === undefined)) return undefined;
  const named = words.map((word) => word!.trim()).filter((word) => word.length > 0 && authoringKey(word) !== "none");
  if (named.length > MAX_CONSEQUENCES || named.some((word) => word.length > MAX_CONSEQUENCE_LENGTH)) return undefined;
  return [...new Set(named)];
}
