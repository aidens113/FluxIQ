// What a call whose no Core's record refutes is told when it is asked once
// more (t607): Core's findings, stated as what Core measured, and the request
// to answer again from the evidence. Never an instruction to answer yes, and
// never anything of a site or task but the rows and columns Core's record
// itself names.
//
// **And what that record does not cover (t663).** A8 towels
// `run-mvahlxuu-760d9e28`: two nos were right for a reason they never gave --
// a kept holder that was not the item asked for -- and Core refuted the
// reasons they did give. The recheck named only left-out rows and asked them
// to answer again, and both answered yes over the holder. So the recheck says
// that Core's record speaks only of the rows it names, and names, where Core
// flagged any, the rows the result keeps that it measured as unlike every
// other kept row (`../request-rows/kept-without-asked-column.ts`,
// `../request-rows/kept-not-naming-the-item.ts`): what it measured, never that
// the row is wrong. Words only; a yes is held to those rows by `../verdict/`.

import type { AutomationStudioRequestRowsKept } from "../request-rows/index.ts";

/** The recheck a call whose every reason for no Core's record refutes is asked again with (header); `kept`, the kept rows Core flagged, said after the record. */
export function automationStudioResultRefutedNoRecheckWords(findings: readonly string[], kept: readonly AutomationStudioRequestRowsKept[] = []): string {
  const flagged = kept.flatMap((flag) => flag.rows.map((row) => flag.kind === "column"
    ? `${row} has no value in the column "${flag.missing}", which every other row carries`
    : `${row} has a name that does not write "${flag.missing}", the request's own words, which every other kept row's name writes`));
  return "This same evidence was judged before, and that answer was no for reasons Core's own record of this run contradicts. "
    + `Core's record: ${findings.join(" ")} `
    + "That record speaks only of the rows it names: it says nothing of whether each row the result keeps is one the request asks for. "
    + (flagged.length ? `Of the rows the result keeps, Core measured only this: ${flagged.join("; ")}. ` : "")
    + "Answer again from the evidence, holding what you say about these rows to that record. If you answer no, say in observed, as before, each row that is wrong or missing and why.";
}
