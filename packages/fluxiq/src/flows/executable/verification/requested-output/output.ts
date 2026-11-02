import type { ResultRequestedRows } from "./rows.ts";

/**
 * What a run owes by the build's own declaration (`../requested-output/`,
 * t757): each part whose declared answer is records, by id, with its columns
 * and, where it declares them, how many rows (K2).
 * Never read off the request's words.
 */

export type ResultRequestedOutput = { parts: Array<{ part: string; columns: string[]; rows?: ResultRequestedRows }> };
