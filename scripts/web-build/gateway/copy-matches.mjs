// Whether a staged web directory carries exactly the Core checkout's gateway
// server artifact and receipt, byte for byte.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { GATEWAY_FILES } from "./files.mjs";

/**
 * @param {string} repoRoot the Core checkout
 * @param {string} webDirectory a staged `apps/web`
 * @returns {Promise<boolean>}
 */
export async function gatewayCopyMatches(repoRoot, webDirectory) {
  for (const file of [GATEWAY_FILES.artifact, GATEWAY_FILES.receipt]) {
    const [canonical, copied] = await Promise.all([read(path.join(repoRoot, "apps", "web", file)), read(path.join(webDirectory, file))]);
    if (canonical === undefined || copied === undefined || !canonical.equals(copied)) return false;
  }
  return true;
}

async function read(file) {
  try {
    return await readFile(file);
  } catch (error) {
    if (error?.code === "ENOENT" || error?.code === "ENOTDIR") return undefined;
    throw error;
  }
}
