import type { JsonObject } from "../../../../core/index.ts";

/**
 * A data step a person adds from the short menu: keep rows where, sort, keep
 * the first N, remove duplicates, save to a dataset or export. The declaration
 * is a data step's own (`@fluxiq/contracts/fluxnode`, `DataStep`), without its
 * id and input, which the graph's edges stand for.
 */
export type OutlineDataStep = JsonObject & { kind: "filter" | "sort" | "limit" | "dedupe" | "sink" };
