import type { AutomationStudioRequestRowsKept } from "../request-rows/index.ts";

/**
 * Core's line for one flag's kept rows a yes did not name beside a quote of the
 * request (header, t663). It says what Core measured and asks for the row to
 * be looked at; it never says the row is wrong, and never "the condition", which
 * `request-rows/checked-rows-named.ts` reads as rows a request asks for.
 */
export function keptLine(flag: AutomationStudioRequestRowsKept): string {
  const one = flag.rows.length === 1;
  // Every row a read stored that kept every item it saw after an act over a narrower read (t692): named beside that read.
  if (flag.kind === "every_row") {
    const read = flag.nodeId ?? "(unnamed)";
    return `The check answered yes without naming, in a sentence that names read ${read} and quotes in double quotes the request's own words for what it asks for, ${one ? "this row" : "these rows"} the result keeps in record set ${flag.datasetId ?? "(unnamed)"}, which read ${read} stored with no condition, keeping every item it saw, after a step ran once per row of the fewer that read ${flag.missing} kept (keptEveryRow): ${flag.rows.join(" | ")}. `
      + `Core measured only that; whether the request asks for ${one ? "this row" : "each"} is the check's to say, and a row the request does not ask for is one the result should not keep.`;
  }
  const where = flag.datasetId !== undefined ? `record set ${flag.datasetId}` : flag.step !== undefined ? `Step ${flag.step}'s read` : `read ${flag.nodeId ?? "(unnamed)"}`;
  const measured = flag.kind === "column"
    ? `${one ? "the only one" : "the only ones"} of its ${flag.of} rows with no value in the column "${flag.missing}", which every other row carries`
    : `${one ? "the only one" : "the only ones"} of its ${flag.of} kept rows whose name does not write "${flag.missing}", the request's own words, as every other kept row's name does`;
  return `The check answered yes without naming, in a sentence that quotes in double quotes the request's own words for what it asks for, ${one ? "this row" : "these rows"} the result keeps in ${where}, ${measured}: ${flag.rows.join(" | ")}. Core measured only that; whether the request asks for ${one ? "this row" : "each"} is the check's to say, and a row the request does not ask for is one the result should not keep.`;
}
