// A record with exactly the given keys and the current schema version, or
// undefined for anything else: absent, half-written, foreign or old.

import { readSmallFile } from "./small-file.mjs";
import { RECORDS } from "../records.mjs";

/** @param {string} file @param {readonly string[]} keys @returns {Promise<Record<string, unknown> | undefined>} */
export async function readRecord(file, keys) {
  const text = await readSmallFile(file);
  if (text === undefined) return undefined;
  let value;
  try {
    value = JSON.parse(text);
  } catch (error) {
    // Records are renamed into place whole, so text that does not parse is a
    // foreign or damaged file, which is no record; anything else is raised.
    if (error instanceof SyntaxError) return undefined;
    throw error;
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  if (Object.keys(value).sort().join(",") !== [...keys].sort().join(",") || value.schemaVersion !== RECORDS.schemaVersion) return undefined;
  return value;
}
