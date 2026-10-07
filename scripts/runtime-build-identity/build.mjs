import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { normalizedIdentityReader } from "./normalize.mjs";

const READER = "packages/fluxiq/dist/runtime/build-identity/read.js";
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
async function files(root, directory, suffix) {
  const entries = await readdir(path.join(root, directory), { withFileTypes: true });
  const found = await Promise.all(entries.filter(entry => entry.name !== "tests").map(entry => entry.isDirectory()
    ? files(root, `${directory}/${entry.name}`, suffix) : entry.name.endsWith(suffix) ? [`${directory}/${entry.name}`] : []));
  return found.flat().sort();
}
/** Executing JS identity, with source freshness recorded separately in the disk stamp. */
export async function buildCoreRuntimeIdentity(root) {
  const artifacts = {}, sources = {};
  for (const packageId of ["contracts", "fluxiq"]) {
    for (const file of await files(root, `packages/${packageId}/dist`, ".js")) {
      const content = await readFile(path.join(root, file));
      artifacts[file] = hash(file === READER ? normalizedIdentityReader(content.toString("utf8")) : content);
    }
    for (const file of await files(root, `packages/${packageId}/src`, ".ts")) sources[file] = hash(await readFile(path.join(root, file)));
    const manifest = `packages/${packageId}/package.json`;
    sources[manifest] = hash(await readFile(path.join(root, manifest)));
  }
  const identity = { schema: 1, protocol: "fluxiq.core-runtime-identity.v1", version: JSON.parse(await readFile(path.join(root, "packages/fluxiq/package.json"), "utf8")).version,
    normalization: "reader-payload-v1", artifactDigest: hash(JSON.stringify(Object.entries(artifacts).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0))), artifacts };
  const readerPath = path.join(root, READER);
  await writeFile(readerPath, normalizedIdentityReader(await readFile(readerPath, "utf8"), JSON.stringify(JSON.stringify(identity))), "utf8");
  await writeFile(path.join(root, "packages/fluxiq/dist/runtime-build-identity.json"), JSON.stringify({ identity, sources }, null, 2) + "\n", "utf8");
  return identity;
}
