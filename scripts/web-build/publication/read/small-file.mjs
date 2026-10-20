// A small record file's text, or undefined when it is absent, empty or larger
// than any record this module writes.

import { readFile, stat } from "node:fs/promises";
import { RECORDS } from "../records.mjs";

/** @param {string} file @returns {Promise<string | undefined>} */
export async function readSmallFile(file) {
  try {
    const details = await stat(file);
    if (!details.isFile() || details.size <= 0 || details.size > RECORDS.maxBytes) return undefined;
    return await readFile(file, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT" || error?.code === "ENOTDIR") return undefined;
    throw error;
  }
}
