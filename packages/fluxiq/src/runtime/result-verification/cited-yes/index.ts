// A yes cites what it checked, and Core checks the citation (t810, framework
// plan P5b, "Computed-first judging"). A yes that says only "yes" is the
// judge's word; one that lists the stored rows it checked, each with the cell
// that shows the row is asked for (`diagnosis.checked`,
// `../../llm/verification-checked/`), is held to Core's own record: the row by
// its label, a column the result stores, and that row's cell equal to the
// value cited, compared as the located defects compare a cell
// (`../located-defects/row-cells.ts`). A citation Core cannot find is refuted
// in Core's sentence (`citation-refuted.ts`); a yes with any refuted citation
// is `unsure`, code `yesCitationRefuted`, never a yes
// (`../verdict/result-verdict.ts`). A yes that cites nothing is read exactly as
// before: recorded replies carry no `checked`.
//
// A row is named by its label (its first stored column's value); a judge that
// cites rows by position ("1", "row 2", "#3") is read as the Nth stored row
// where no label is that, in the order the rows are held. A label always wins
// over a position, and the column and value must still match that row.
//
// The stored rows are the answer's, never a working set's (`stored-cells.ts`);
// where Core holds only a sample of them, a cited row it does not find is not
// refuted, since it may be a row Core was not shown (`yes-citations.ts`).
export { automationStudioResultCitationRefuted } from "./citation-refuted.ts";
export { automationStudioResultCitedStoredCells } from "./stored-cells.ts";
export { automationStudioResultYesCitations } from "./yes-citations.ts";
