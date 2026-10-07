import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { serverSourceInventory } from "./inventory.mjs";
import { serverIdentitySlot } from "./normalize.mjs";
/** Owning generator stamps native executable bytes; all reached local source must be declared. */
export async function stampServerBuildIdentity(root, outfile, reachedInputs = []) {
  const hash = bytes => createHash("sha256").update(bytes).digest("hex"), sources = {};
  const inventory = await serverSourceInventory(root);
  for (const input of reachedInputs) {
    const relative = path.relative(root, path.resolve(input)).split(path.sep).join("/");
    if (!inventory.includes(relative) && !relative.includes("node_modules/")) throw new Error(`Server bundle reached an undeclared source: ${relative}`);
  }
  for (const key of inventory) sources[key] = hash(await readFile(path.join(root, key)));
  const artifact = await readFile(outfile, "utf8"), manifest = JSON.parse(await readFile(path.join(root, "apps/web/package.json"), "utf8"));
  const identity = { schema: 1, protocol: "fluxiq.module-build-identity.v1", moduleId: "fluxiq/web-client-gateway-server", version: manifest.version,
    normalization: "module-payload-v1", artifactDigest: hash(serverIdentitySlot(artifact)), sourceInputsDigest: hash(JSON.stringify(sources)) };
  await writeFile(outfile, serverIdentitySlot(artifact, identity));
  await writeFile(`${outfile}.identity.json`, JSON.stringify({ identity, sources }, null, 2) + "\n");
  return identity;
}
