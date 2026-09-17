// How a key the model wrote is matched against a name Core knows.
//
// The model writes `Dataset Id`, `dataset_id`, `datasetID` or `dataset-id` and
// means one thing, so every comparison in this directory goes through
// `authoringKey`: lower case, letters and digits only. Nothing here decides
// what a key means; it only decides when two spellings are the same word.

/** A key or name reduced to the form two spellings share. */
export function authoringKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/gu, "");
}

/** A label reduced to the form two references to the same step share. */
export function authoringLabel(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/gu, " ");
}

/** A symbolic plan key built from words the model wrote, or `undefined` when it holds none. */
export function authoringSymbol(value: string): string | undefined {
  const symbol = value.toLowerCase().replace(/[^a-z0-9_-]+/gu, "-").replace(/^[-_]+|[-_]+$/gu, "").slice(0, 64);
  return /^[a-z]/u.test(symbol) ? symbol : undefined;
}

/** A dataset id built from words the model wrote: the record-set id syntax, or `undefined`. */
export function authoringDatasetId(value: string): string | undefined {
  const id = value.trim().replace(/\s+/gu, "-").replace(/[^A-Za-z0-9._:-]+/gu, "").slice(0, 200);
  return id && id !== "." && id !== ".." ? id : undefined;
}

/** A record field id built from a column name the model wrote, or `undefined`. */
export function authoringFieldId(value: string): string | undefined {
  const id = value.trim().replace(/\s+/gu, "_").replace(/[^A-Za-z0-9_-]+/gu, "").slice(0, 100);
  return id && !["__proto__", "constructor", "prototype"].includes(id) ? id : undefined;
}
