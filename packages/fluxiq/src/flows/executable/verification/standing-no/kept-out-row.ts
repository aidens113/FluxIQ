/**
 * One row a condition alone left out that Core's record accounts for (t641,
 * `../refuted-no/types.ts`, `AutomationStudioResultNoAccounted`): `also_in_result`,
 * another copy of it kept; `request_words`, a value Core read on it failing
 * the request's own words, `texts`.
 */

export type ResultStandingNoKeptOutRow = { label: string; by: "also_in_result" | "request_words"; texts?: string[] | undefined };
