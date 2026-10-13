// The rows a summary holds, read against the request and against what a judge
// says of them (live run `run-muw60j7c-bb7c9a62`, debug C-2 and C-5): the
// left-out rows that name the asked item (`left-out-naming-the-item.ts`), set on
// the judge's copy of the summary (`summary-with-left-out-naming-the-item.ts`);
// the ones a yes did not name (`unaccounted-rows.ts`); Core's check of the rows
// a no names (`checked-rows.ts`), and the rows its lines name, per read and
// condition (`checked-rows-named.ts`, read back from a judgement value by
// `named-of.ts`); what a rerun of a read did to those rows (`rerun-rows.ts`);
// the left-out rows stating a number their text condition kept on another row
// (`left-out-stating-a-kept-number.ts`, t478); and how they are read: words
// (`words.ts`), request phrases (`request-phrases.ts`), a summary's reads
// (`summary-reads.ts`) and how a row is named (`row-naming.ts`). And, held to
// the request's own words (t515, live run `run-mv6v2hx5-f448e662`): the
// request as a judge's words are read against (`request-wording.ts`), the
// left-out rows a yes did not name beside a quote of the request's excluding
// words (`unquoted-rows.ts`), and the exclusions an advice adds that the
// request never states (`unstated-exclusions.ts`).
export * from "./checked-rows.ts";
export * from "./checked-rows-named.ts";
export * from "./left-out-naming-the-item.ts";
export * from "./left-out-stating-a-kept-number.ts";
export * from "./named-of.ts";
export * from "./request-phrases.ts";
export * from "./request-wording.ts";
export * from "./rerun-rows.ts";
export * from "./row-naming.ts";
export * from "./summary-reads.ts";
export * from "./summary-with-left-out-naming-the-item.ts";
export * from "./types.ts";
export * from "./unaccounted-rows.ts";
export * from "./unquoted-rows.ts";
export * from "./unstated-exclusions.ts";
export * from "./words.ts";
