// Barrel for offline-first trials (trace plan P6, t769): the optional
// `offlineFirst` trial port member both trial gates ask before any site
// action, the one step that turns its answer into keep or live, and the plain
// words a model reads about it. Trace-free by rule: this directory is on the
// `from` side of the "trace-free model guidance" boundary.
export * from "./contracts.ts";
export * from "./gate-step.ts";
export * from "./words.ts";
