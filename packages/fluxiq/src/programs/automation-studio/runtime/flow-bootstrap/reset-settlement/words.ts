// What an open act's `settle` says (L1 reset settlement): one sentence, built
// from its open reasons (`./decision.ts`), naming only this run's
// own destination refs and locations. Generic by rule: no site, page,
// product or task is named (AGENTS.md, "Model guidance never teaches to the
// test").
//
// Two guards:
//
// - **Only refs read before the act (t751 R6, replacing rerun round 2's
//   `closed`).** An act with no witness is told only the issued refs whose
//   lists were read complete before it (`./judge.ts` hands it those): a list
//   read after it can never show it put back. Where no list was read before it
//   (`unnamable`), it is never told to read a list and name its ref (job
//   `run-mvgf4pk5-55343613`: told to, the model invented `destination-1`); it
//   is told that this act cannot be settled in this build, so trials stay
//   refused while it is in place.
// - A withheld place is never printed: a location that is absent or carries
//   the trace-withholding marker (`../../executor/trace-withholding.ts`) names
//   no address.

import { AUTOMATION_STUDIO_WITHHELD_VALUE } from "../../executor/trace-withholding.ts";
import type { AutomationStudioSiteResetOpenReason } from "./decision.ts";
import { AUTOMATION_STUDIO_SITE_RESET_UNDOES_KEY as UNDOES } from "./undoes-key.ts";

/** A destination ref the model was shown: how many items its list held when first read complete, and where. */
export type AutomationStudioSiteResetIssuedRef = { ref: string; count: number; location?: string };

/** The sentence an open act's `settle` carries (header). `before`: the issued refs whose lists were read complete before the act; `unnamable`: no list was. */
export function automationStudioSiteResetSettleWords(reasons: readonly AutomationStudioSiteResetOpenReason[], before: readonly AutomationStudioSiteResetIssuedRef[], options: { unnamable?: boolean } = {}): string {
  const said = [...new Set(reasons.map((reason) => clause(reason, before, options.unnamable === true)))];
  const sentence = said.join("; ");
  return sentence ? `${sentence[0]!.toUpperCase()}${sentence.slice(1)}.` : "";
}

function clause(reason: AutomationStudioSiteResetOpenReason, before: readonly AutomationStudioSiteResetIssuedRef[], unnamable: boolean): string {
  const at = where(reason.location);
  const list = reason.ref ?? "the list it was checked against";
  if (reason.reason === "look" && reason.witness === "toggle") return `read the page${at} again so its control's state can be seen`;
  if (reason.reason === "look") return `read ${list}${at} completely again`;
  if (reason.reason === "undo") return `${list}${at} still differs from how the build found it: undo this act there, naming it under ${UNDOES}`;
  if (reason.reason === "toggle") return `its control${at} still shows the state this act set: press that same control back once, naming this act under ${UNDOES}`;
  // A control whose place was never read before the build acted there (`./control-tracker.ts`, t751 R1): no call can meet it.
  if (reason.reason === "baseline") return `its control${at} was never read before the build acted there, so nothing read can show it put back: no call can settle it in this build`;
  // A list Core's own look could not read again (`./reach.ts`, t743): no call can meet it.
  if (reason.reason === "unreachable") return `${list}${at} could not be read again, and nothing else shows this act put back: no call can settle it in this build`;
  if (unnamable) {
    return "nothing read shows where its effect would be, and no list was read complete before this act, so none can be named for it: no call can settle it in this build, and trials stay refused while it is in place";
  }
  const known = before.map((entry) => `${entry.ref} (${entry.count} ${entry.count === 1 ? "item" : "items"}${where(entry.location)})`);
  return "nothing read shows where its effect would be: read the list where it would show completely and name that list's ref as resetDestination on a look that names this act under "
    + `${UNDOES}${known.length ? ` (lists read complete before this act: ${known.join(", ")})` : " (no ref has been shown yet)"}`;
}

/** ` at <location>`, or nothing where the location is absent or withheld (header). */
function where(location: string | undefined): string {
  return location && !location.includes(AUTOMATION_STUDIO_WITHHELD_VALUE) ? ` at ${location}` : "";
}
