// The `.next/BUILD_ID` of a web directory, or undefined unless it holds one
// well-formed id.

import path from "node:path";
import { readSmallFile } from "./small-file.mjs";
import { RECORDS } from "../records.mjs";

/** @param {string} webDirectory @returns {Promise<string | undefined>} */
export async function readBuildId(webDirectory) {
  const buildId = (await readSmallFile(path.join(webDirectory, ".next", "BUILD_ID")))?.trim();
  return buildId && RECORDS.buildId.test(buildId) ? buildId : undefined;
}
