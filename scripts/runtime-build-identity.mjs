import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildCoreRuntimeIdentity } from "./runtime-build-identity/index.mjs";

await buildCoreRuntimeIdentity(path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."));
