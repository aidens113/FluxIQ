// What an open act's `settle` says (L1 reset settlement): one sentence, built
// from its open reasons (`./settlement-decision.ts`), naming only this run's
// own destination refs and locations. Generic by rule: no site, page,
// product or task is named (AGENTS.md, "Model guidance never teaches to the
// test").

import { AUTOMATION_STUDIO_SITE_RESET_UNDOES_KEY as UNDOES } from "./contracts.ts";
import type { AutomationStudioSiteResetOpenReason } from "./settlement-decision.ts";

/** A destination ref the model was shown: how many items its list held when first read complete, and where. */
export type AutomationStudioSiteResetIssuedRef = { ref: string; count: number; location?: string };

/** The sentence an open act's `settle` carries (header). */
export function automationStudioSiteResetSettleWords(reasons: readonly AutomationStudioSiteResetOpenReason[], issued: readonly AutomationStudioSiteResetIssuedRef[]): string {
  const said = [...new Set(reasons.map((reason) => clause(reason, issued)))];
  const sentence = said.join("; ");
  return sentence ? `${sentence[0]!.toUpperCase()}${sentence.slice(1)}.` : "";
}

function clause(reason: AutomationStudioSiteResetOpenReason, issued: readonly AutomationStudioSiteResetIssuedRef[]): string {
  const at = reason.location ? ` at ${reason.location}` : "";
  const list = reason.ref ?? "the list it was checked against";
  if (reason.reason === "look" && reason.witness === "toggle") return `read the page${at} again so its control's state can be seen`;
  if (reason.reason === "look") return `read ${list}${at} completely again`;
  if (reason.reason === "undo") return `${list}${at} still differs from how the build found it: undo this act there, naming it under ${UNDOES}`;
  if (reason.reason === "toggle") return `its control${at} still shows the state this act set: press that same control back once, naming this act under ${UNDOES}`;
  const known = issued.map((entry) => `${entry.ref} (${entry.count} ${entry.count === 1 ? "item" : "items"}${entry.location ? ` at ${entry.location}` : ""})`);
  return "nothing read shows where its effect would be: read the list where it would show completely and name that list's ref as resetDestination on a look that names this act under "
    + `${UNDOES}${known.length ? ` (lists read complete before the build acted: ${known.join(", ")})` : " (no list was read complete before the build acted)"}`;
}
