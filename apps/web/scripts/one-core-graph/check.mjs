// node scripts/one-core-graph/check.mjs [<.next directory>]
//
// Runs the one-Core-graph check on a build already on disk (by default
// `apps/web/.next`), recognising Core's modules from the `fluxiq` package
// `apps/web` resolves. `next build` runs the same check itself
// (`next.config.ts`), so this is for inspecting an existing build.

import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertOneCoreGraph } from "./assert-one-core-graph.mjs";

const webDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const distDirectory = path.resolve(process.argv[2] ?? path.join(webDirectory, ".next"));
try {
  const { files, bundled } = await assertOneCoreGraph({ distDirectory, coreDirectory: path.join(webDirectory, "node_modules", "fluxiq") });
  console.log(`One Core graph: ${files} Node server files bundle ${bundled} Core module(s), none more than once.`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
