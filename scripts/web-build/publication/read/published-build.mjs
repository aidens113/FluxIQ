// The build published for a key, or undefined when none is complete.
//
// A reader accepts an attempt only when the key's publication names it, its
// completion marker names the same key and the same build id as its
// `.next/BUILD_ID`, and the gateway server artifact and its receipt are
// beside it, so a failed, interrupted or half-written attempt is never reused.

import { access } from "node:fs/promises";
import path from "node:path";
import { readBuildId } from "./build-id.mjs";
import { readRecord } from "./record.mjs";
import { RECORDS } from "../records.mjs";

const GATEWAY_ARTIFACT = [".server-runtime", "client-gateway-server.mjs"];

/**
 * @param {string} keyDirectory
 * @param {string} key
 * @returns {Promise<{ key: string, directory: string, webDirectory: string, buildId: string } | undefined>}
 */
export async function readPublishedBuild(keyDirectory, key) {
  const publication = await readRecord(path.join(keyDirectory, RECORDS.publication), ["attempt", "key", "schemaVersion"]);
  if (!publication || publication.key !== key || typeof publication.attempt !== "string" || !RECORDS.attemptName.test(publication.attempt)) return undefined;
  const directory = path.join(keyDirectory, publication.attempt);
  const webDirectory = path.join(directory, "apps", "web");
  const marker = await readRecord(path.join(directory, RECORDS.completion), ["buildId", "key", "schemaVersion"]);
  if (!marker || marker.key !== key) return undefined;
  const buildId = await readBuildId(webDirectory);
  if (!buildId || marker.buildId !== buildId) return undefined;
  const artifact = path.join(webDirectory, ...GATEWAY_ARTIFACT);
  if (!(await present(artifact)) || !(await present(`${artifact}.identity.json`))) return undefined;
  return { key, directory, webDirectory, buildId };
}

async function present(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}
