// Deletes a step's stamp, so nothing vouches for outputs a failed or disturbed
// run may have left half-written. An absent stamp is already removed.

import { rm } from "node:fs/promises";

/** @param {string} stampPath */
export async function removeStamp(stampPath) {
  await rm(stampPath, { force: true });
}
