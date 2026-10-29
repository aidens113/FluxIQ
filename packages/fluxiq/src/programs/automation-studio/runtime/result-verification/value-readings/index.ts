// How Core read a result's values, said for the judge (t511): the number a
// bound compared and the part of the text a text test found, on a few rows a
// condition kept and left out (`condition-readings.ts`, `text-match.ts`); what
// each sort key read its column as and whether the rows are in that order
// (`sort-reading.ts`); the rows a numeric bound, a presence test or a text
// test left out that Core settles itself (`settled-rows.ts`); all set on a run summary from the record outputs its
// steps declare (`summary-readings.ts`, `record-outputs.ts`); and whether a
// judge's words deny an order Core found (`order-claim.ts`).
export * from "./condition-readings.ts";
export * from "./kept-date-order.ts";
export * from "./order-claim.ts";
export * from "./record-outputs.ts";
export * from "./settled-rows.ts";
export * from "./sort-reading.ts";
export * from "./summary-readings.ts";
export * from "./text-match.ts";
