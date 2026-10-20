// What an open act's `settle` says (L1 reset settlement): one sentence, built
// from its open reasons (`./decision.ts`), naming only this run's
// own destination refs and locations. Generic by rule: no site, page,
// product or task is named (AGENTS.md, "Model guidance never teaches to the
// test").
//
// Two guards (rerun round 2, job `run-mvgf4pk5-55343613`):
//
// - Once no ref can be issued any more (`closed`: the baselines are sealed and
//   every original was already shown) and none was, an act with no witness is
//   never told to read a list and name its ref: no read can issue one, and the
//   model invented `destination-1` when told to. It is told instead that this
//   act cannot be settled in this build, so trials stay refused while it is in
//   place.
// - A withheld place is never printed: a location that is absent or carries
//   the trace-withholding marker (`../../executor/trace-withholding.ts`) names
//   no address.

import { AUTOMATION_STUDIO_WITHHELD_VALUE } from "../../executor/index.ts";
import type { AutomationStudioSiteResetOpenReason } from "./decision.ts";
import { AUTOMATION_STUDIO_SITE_RESET_UNDOES_KEY as UNDOES } from "./undoes-key.ts";

/** A destination ref the model was shown: how many items its list held when first read complete, and where. */
export type AutomationStudioSiteResetIssuedRef = { ref: string; count: number; location?: string };

/** The sentence an open act's `settle` carries (header). `closed`: no ref can be issued any more. */
export function automationStudioSiteResetSettleWords(reasons: readonly AutomationStudioSiteResetOpenReason[], issued: readonly AutomationStudioSiteResetIssuedRef[], options: { closed?: boolean } = {}): string {
  const said = [...new Set(reasons.map((reason) => clause(reason, issued, options.closed === true)))];
  const sentence = said.join("; ");
  return sentence ? `${sentence[0]!.toUpperCase()}${sentence.slice(1)}.` : "";
}

function clause(reason: AutomationStudioSiteResetOpenReason, issued: readonly AutomationStudioSiteResetIssuedRef[], closed: boolean): string {
  const at = where(reason.location);
  const list = reason.ref ?? "the list it was checked against";
  if (reason.reason === "look" && reason.witness === "toggle") return `read the page${at} again so its control's state can be seen`;
  if (reason.reason === "look") return `read ${list}${at} completely again`;
  if (reason.reason === "undo") return `${list}${at} still differs from how the build found it: undo this act there, naming it under ${UNDOES}`;
  if (reason.reason === "toggle") return `its control${at} still shows the state this act set: press that same control back once, naming this act under ${UNDOES}`;
  // A list Core's own look could not read again (`./reach.ts`, t743): no call can meet it.
  if (reason.reason === "unreachable") return `${list}${at} could not be read again, and nothing else shows this act put back: no call can settle it in this build`;
  if (closed && issued.length === 0) {
    return "nothing read shows where its effect would be, and this act cannot be settled in this build: nothing was read complete before the build's first lasting act, so no list can be named for it any more, and trials stay refused while it is in place";
  }
  const known = issued.map((entry) => `${entry.ref} (${entry.count} ${entry.count === 1 ? "item" : "items"}${where(entry.location)})`);
  return "nothing read shows where its effect would be: read the list where it would show completely and name that list's ref as resetDestination on a look that names this act under "
    + `${UNDOES}${known.length ? ` (lists read complete before the build acted: ${known.join(", ")})` : " (no ref has been shown yet)"}`;
}

/** ` at <location>`, or nothing where the location is absent or withheld (header). */
function where(location: string | undefined): string {
  return location && !location.includes(AUTOMATION_STUDIO_WITHHELD_VALUE) ? ` at ${location}` : "";
}
