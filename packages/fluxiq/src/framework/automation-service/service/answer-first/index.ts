// The answer-first path (t861, plan D1): one live exploration that must reach the person's result.
// `./attempt/` drives it, over its rows and witnesses, the act record's run gate, the completion
// check and the attempt store. The service reaches this by a dynamic import, on the lines it
// already has: `../../service.ts` has a line limit, and this loads the loop's modules.
export * from "./attempt/index.ts";
export * from "./attempt-store/index.ts";
export * from "./completion/index.ts";
export * from "./loop-signal/index.ts";
export * from "./rows/index.ts";
export * from "./run-acts/index.ts";
export * from "./setup/index.ts";
export * from "./witnesses/index.ts";
export * from "./route/index.ts";
export * from "./task-key/index.ts";
export * from "./task-memory/index.ts";
