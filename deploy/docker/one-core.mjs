// node deploy/one-core.mjs <directory>...
//
// Fails the image build unless every directory Node loads server code from
// resolves the `fluxiq` package to one real directory. The panel's server
// chunks (instrumentation, routes and pages) and the client gateway's native
// server (`.server-runtime/client-gateway-server.mjs`) run in one Node
// process and import Core by name; a second copy of the package beside any of
// them (the image once linked the gateway to its own `pnpm deploy` of
// fluxiq) is a second evaluation of Core's module-level state in that
// process. Resolution here is Node's: the nearest `node_modules/fluxiq`
// walking up from the directory, followed to its real path.

import { existsSync, realpathSync } from "node:fs";
import path from "node:path";

/**
 * @param {string} directory
 * @returns {string | null} the real directory `fluxiq` resolves to from it, or null when none does
 */
function coreFrom(directory) {
  for (let at = path.resolve(directory); ; at = path.dirname(at)) {
    const candidate = path.join(at, "node_modules", "fluxiq");
    if (existsSync(path.join(candidate, "package.json"))) return realpathSync(candidate);
    if (path.dirname(at) === at) return null;
  }
}

const directories = process.argv.slice(2);
if (directories.length === 0) {
  console.error("one-core: name the directories Node loads server code from.");
  process.exit(2);
}
const found = directories.map((directory) => ({ directory, core: existsSync(directory) ? coreFrom(directory) : null }));
const cores = new Set(found.map((entry) => entry.core));
for (const { directory, core } of found) console.log(`one-core: ${directory} -> ${core ?? "(no fluxiq package)"}`);
if (cores.has(null) || cores.size !== 1) {
  console.error(`one-core: the image's server code must load one copy of Core, but it resolves ${cores.has(null) ? "no fluxiq package from some directories" : `${cores.size} copies`}.`);
  process.exit(1);
}
console.log(`one-core: one copy of Core at ${[...cores][0]}.`);
