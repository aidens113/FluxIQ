// Barrel for graceful shutdown: the draining flag, the program calls refused
// while draining, and the wait for open gateway connections. Moved from
// `apps/web/src/server/drain/`, which re-exports it.
export * from "./drain-gateway.ts";
export * from "./drain-state.ts";
export * from "./program-start-refusal.ts";
