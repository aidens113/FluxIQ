// Records that an attempt's build finished with `buildId`. Called only after
// `next build` exited 0 and every post-build check passed.

import path from "node:path";
import { RECORDS } from "./records.mjs";
import { writeRecord } from "./write-record.mjs";

/** @param {string} directory the attempt directory @param {string} key @param {string} buildId */
export async function markBuildComplete(directory, key, buildId) {
  await writeRecord(path.join(directory, RECORDS.completion), { schemaVersion: RECORDS.schemaVersion, key, buildId });
}
