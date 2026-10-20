// Points a key at one completed attempt. The rename is the publication.

import path from "node:path";
import { RECORDS } from "./records.mjs";
import { writeRecord } from "./write-record.mjs";

/** @param {string} keyDirectory @param {string} key @param {string} attempt */
export async function publishBuildAttempt(keyDirectory, key, attempt) {
  if (!RECORDS.attemptName.test(attempt)) throw new Error(`Refused to publish a malformed web build attempt name: ${JSON.stringify(attempt)}`);
  await writeRecord(path.join(keyDirectory, RECORDS.publication), { schemaVersion: RECORDS.schemaVersion, key, attempt });
}
