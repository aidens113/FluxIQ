// Whether a production build of the panel holds one copy of Core.
// `next.config.ts` runs `assertOneCoreGraph` after every production compile;
// `check.mjs` runs it on an existing build.

export { assertOneCoreGraph } from "./assert-one-core-graph.mjs";
export { coreExportSignatures } from "./core-export-signatures.mjs";
export { coreModuleCopies } from "./core-module-copies.mjs";
