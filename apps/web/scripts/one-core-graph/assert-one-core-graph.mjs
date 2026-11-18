// Refuses a panel build whose Node server holds more than one copy of Core.
//
// Next compiles instrumentation, route handlers and pages as separate graphs:
// instrumentation and the routes get different module ids, and pages run
// under a Turbopack runtime of their own. A Core module bundled into more than
// one of them is evaluated once per copy, so its module-level state (the
// activity hub, `iamStoreChanges`, the database operation locks, every WeakMap
// side table) exists more than once: runs publish to one copy while a route
// subscribes to another. `next.config.ts` keeps Core out of the bundles
// (`serverExternalPackages`), so Node loads it once and every graph, and the
// host module, share it. It runs this after the compile
// (`compiler.runAfterProductionCompile`), so a build that splits Core fails.
// Unit tests cannot see the split: they run one module graph.

import path from "node:path";
import { coreExportSignatures } from "./core-export-signatures.mjs";
import { coreModuleCopies } from "./core-module-copies.mjs";

const SHOWN = 8;

/**
 * @param {{ distDirectory: string, coreDirectory: string }} build the build's
 *   `.next` directory, and the `fluxiq` package the panel resolves
 * @returns {Promise<{ files: number, bundled: number }>} how many Node server
 *   files were read, and how many Core modules they bundle (each once)
 */
export async function assertOneCoreGraph({ distDirectory, coreDirectory }) {
  const serverDirectory = path.join(distDirectory, "server");
  const signatures = await coreExportSignatures(coreDirectory);
  const { files, registrations, copies } = await coreModuleCopies(serverDirectory, signatures);
  if (files === 0) {
    throw new Error(`One Core graph: the build left no Node server JavaScript in ${serverDirectory} to check.`);
  }
  if (registrations === 0) {
    throw new Error(`One Core graph: none of the ${files} Node server files registers a module export in the form this check reads (Turbopack's \`e.s([...], id)\`), so it cannot see which modules they hold. Update scripts/one-core-graph for the bundler's output.`);
  }
  const split = [...copies].filter(([, held]) => held.size > 1).sort(([a], [b]) => a.localeCompare(b));
  if (split.length > 0) {
    const shown = split.slice(0, SHOWN).map(([module, held]) => `  fluxiq/${module}: ${held.size} copies, ${[...held].map(([copy, chunks]) => `${copy} (${chunks.join(", ")})`).join("; ")}`);
    const more = split.length > SHOWN ? [`  ... and ${split.length - SHOWN} more`] : [];
    throw new Error(
      [
        `One Core graph: ${split.length} Core module(s) are bundled more than once into the Node server (under different module ids or Turbopack runtimes), so the panel server holds more than one copy of Core's module-level state.`,
        ...shown,
        ...more,
        "Node must load Core once for instrumentation, routes and pages alike: keep `fluxiq` in serverExternalPackages (apps/web/next.config.ts)."
      ].join("\n")
    );
  }
  return { files, bundled: copies.size };
}
