// Barrel for the program route, `/api/programs/<programId>/<endpoint>`: the
// handler every server mounts, the paired-client allowlist and narrowing, the
// project-domain gate, and the JSON writing guard. Moved from `apps/web` so a
// server without Next.js answers it exactly as the web panel does.
export * from "./handle-program-request.ts";
export * from "./paired-client-project-domain.ts";
export * from "./present-panel-session.ts";
export * from "./program-json-text.ts";
export * from "./program-route.ts";
