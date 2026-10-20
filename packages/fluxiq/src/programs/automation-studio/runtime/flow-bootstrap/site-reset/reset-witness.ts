// Whether a reversible lasting press would land with nothing that could ever
// settle it (rerun round 2, job `run-mvgf4pk5-55343613`).
//
// An act settles only on its witnesses (`./settlement-decision.ts`): a complete
// list it sat in, a list named for it by an issued ref, or its own control's
// toggle. The first lasting act seals the build's baselines
// (`./create-baselines.ts`), and after that no read can become an original or
// issue a ref. So a reversible press that, before the seal, has none of these
// is already known to be unsettleable once it lands: the job build pressed a
// save icon declared `modify_existing` before reading any list, sealed the
// baselines, and every trial was refused for the rest of the build. Such a
// press is refused unrun instead, while the model can still observe the list
// where its effect would show and retry naming the ref that observation issues.
//
// A witness is any of:
//
// - the call names an issued ref that resolves to an original of this
//   resource (`destination`, the caller's `destination()`);
// - its control sits in a list recorded complete as an original of the same
//   resource (`original(scope, resource)`);
// - its control has a stated state at a place, and the press declares exactly
//   `modify_existing`: the toggle witness (`./settlement-toggle-witness.ts`)
//   needs both.
//
// Only a press the ledger would hold strictly (its control names a subject,
// page or scope) needs one: an unscoped act keeps its legacy policy. An
// identified or unidentified `create_new` alone keeps the creation
// precondition's own policy, unchanged. Pure.

import type { AutomationStudioActionConsequence } from "../../action-permissions/index.ts";
import type { AutomationStudioSiteResetDeclared } from "./contracts.ts";

/** The classes the site's own controls can reverse. */
const REVERSIBLE: ReadonlySet<AutomationStudioActionConsequence> = new Set(["create_new", "modify_existing", "delete"]);

/** Whether `declared` is a reversible lasting press with no witness (header); the caller asks this only before the seal. */
export function automationStudioSiteResetWitnessMissing(
  declared: Pick<AutomationStudioSiteResetDeclared, "effect" | "consequences" | "control">,
  known: { original(scope: string, resource: string): boolean; destination(): boolean }
): boolean {
  const { control, consequences } = declared;
  if (declared.effect !== "mutate" || consequences.length === 0 || !consequences.every((consequence) => REVERSIBLE.has(consequence))) return false;
  const only = consequences.length === 1 ? consequences[0] : undefined;
  if (only === "create_new") return false;
  if (control.subject === undefined && control.page === undefined && control.scope === undefined) return false;
  if (known.destination()) return false;
  if (control.scope !== undefined && control.resource !== undefined && known.original(control.scope, control.resource)) return false;
  return !(only === "modify_existing" && control.state !== undefined && control.place !== undefined);
}
