import type { AutomationStudioActionConsequence } from "../../action-permissions/index.ts";
import type { AutomationStudioProjectTaskSpec } from "./task-spec.ts";

// The lasting acts a brief may permit: none when no part it names asks for one,
// and otherwise every lasting act the task spec asks for anywhere (t575).
//
// The two class names a project build compares are model judgements made apart:
// the supervisor files each part's acts when it writes the task spec, and the
// builder declares what its own press does when it makes it. An "add to the
// list" filed as `modify_existing` and pressed as `create_new` would reach the
// person's gate in a project build and never in a single-loop one. What a
// brief's scope keeps from a builder is acting at all on parts that only read;
// which class an acting part's press falls in is left to the person's
// permission, as it is in a single-loop build. It never widens past what the
// person asked: an act no part of the task asks for stays out.
export function automationStudioProjectAskedActs(taskSpec: AutomationStudioProjectTaskSpec, parts: readonly string[]): AutomationStudioActionConsequence[] {
  const named = new Set(parts);
  if (!taskSpec.parts.some((part) => named.has(part.id) && part.lastingActs.length > 0)) return [];
  return [...new Set(taskSpec.parts.flatMap((part) => part.lastingActs))];
}
