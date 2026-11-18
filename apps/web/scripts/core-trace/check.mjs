// node scripts/core-trace/check.mjs [<.next directory>]
//
// Runs the Core trace check on a build already on disk (by default
// `apps/web/.next`), with the gateway's native server beside it. `next build`
// runs the same check itself (`next.config.ts`).

import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertCoreTraced } from "./assert-core-traced.mjs";

const webDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const distDirectory = path.resolve(process.argv[2] ?? path.join(webDirectory, ".next"));
try {
  const { requests, traced } = await assertCoreTraced({ distDirectory, webDirectory, modules: [path.join(webDirectory, ".server-runtime", "client-gateway-server.mjs")] });
  console.log(`Core trace: the Node server's ${traced} traced files carry all ${requests} Core entry points it imports through Node.`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
