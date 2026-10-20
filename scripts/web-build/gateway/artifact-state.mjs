// Whether a Core checkout's gateway server artifact is current: its receipt
// names exactly the generator's present source inventory, every source still
// has the hash the receipt recorded, and the artifact still has the digest its
// stamp recorded. This is the check the generator's own stamp
// (`apps/web/scripts/gateway-server-identity/build.mjs`) makes true, read back.

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { serverIdentitySlot, serverSourceInventory } from "../../../apps/web/scripts/gateway-server-identity/index.mjs";
import { GATEWAY_FILES } from "./files.mjs";

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

/**
 * @param {string} repoRoot the Core checkout
 * @returns {Promise<{ current: boolean, reason: string }>}
 */
export async function gatewayArtifactState(repoRoot) {
  const web = path.join(repoRoot, "apps", "web");
  let receipt;
  let artifact;
  try {
    receipt = JSON.parse(await readFile(path.join(web, GATEWAY_FILES.receipt), "utf8"));
    artifact = await readFile(path.join(web, GATEWAY_FILES.artifact), "utf8");
  } catch (error) {
    if (error?.code === "ENOENT" || error?.code === "ENOTDIR") return { current: false, reason: "no artifact or receipt" };
    if (error instanceof SyntaxError) return { current: false, reason: "the receipt is not JSON" };
    throw error;
  }
  const { identity, sources } = receipt ?? {};
  if (!isPlainObject(identity) || !isPlainObject(sources)) return { current: false, reason: "the receipt is malformed" };
  const inventory = await serverSourceInventory(repoRoot);
  if (JSON.stringify(Object.keys(sources).sort()) !== JSON.stringify(inventory)) return { current: false, reason: "the source inventory changed" };
  const hashes = {};
  for (const file of inventory) {
    hashes[file] = sha256(await readFile(path.join(repoRoot, file)));
    if (hashes[file] !== sources[file]) return { current: false, reason: `source changed: ${file}` };
  }
  if (sha256(JSON.stringify(hashes)) !== identity.sourceInputsDigest) return { current: false, reason: "the receipt's source digest does not match its sources" };
  let normalized;
  try {
    normalized = serverIdentitySlot(artifact);
  } catch {
    return { current: false, reason: "the artifact has no identity slot" };
  }
  if (sha256(normalized) !== identity.artifactDigest) return { current: false, reason: "the artifact changed since it was stamped" };
  return { current: true, reason: "the receipt matches every source and the artifact" };
}

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
