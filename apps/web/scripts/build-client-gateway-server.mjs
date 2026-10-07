import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { stampServerBuildIdentity } from "./gateway-server-identity/index.mjs";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const outfile = path.join(root, "apps/web/.server-runtime/client-gateway-server.mjs");
await mkdir(path.dirname(outfile), { recursive: true });
const result = await build({ entryPoints: [path.join(root, "apps/web/src/server/client-gateway-websocket.ts")], outfile, bundle: true,
  platform: "node", target: ["node22"], format: "esm", external: ["fluxiq", "fluxiq/*"], metafile: true, sourcemap: false, logLevel: "silent" });
await stampServerBuildIdentity(root, outfile, Object.keys(result.metafile.inputs));
console.log("Native client gateway server artifact and companion generated.");
