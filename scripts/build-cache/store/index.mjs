// The shared build store: step results keyed by their path-independent
// fingerprint (or, for outputs that name their tree, by fingerprint and tree),
// outside every checkout, so one tree restores what another built.
// `saveEntry` after a stamped build, `restoreEntry` before building,
// `pruneStore` keeps it bounded; the rest is what they are made of.

export { ENTRY_FORMAT, entriesDirectory, entryDirectory, rootedEntryDirectory, temporaryDirectory, treeRoot } from "./entry-location.mjs";
export { findEmbeddedPath } from "./find-embedded-path.mjs";
export { listOutputFiles } from "./list-output-files.mjs";
export { pathSpellings } from "./path-spellings.mjs";
export { pruneStore } from "./prune-store.mjs";
export { readEntry } from "./read-entry.mjs";
export { restoreEntry } from "./restore-entry.mjs";
export { saveEntry } from "./save-entry.mjs";
export { storeDirectory } from "./store-directory.mjs";
