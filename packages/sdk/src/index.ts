// `@fluxiq/sdk`: a thin TypeScript client of the FluxNode HTTP API.
//
//   const fluxiq = await FluxIQ.connect();
//   const run = await fluxiq.run(node, inputs);
//
// The contracts (`@fluxiq/contracts/fluxnode`) are the one source of every wire shape;
// this package adds the zod bridge, the credential chain and key signing, and the
// event loop that answers the engine's check in this process.
export { z } from "zod";
export * from "./client/index.ts";
export * from "./define/index.ts";
export * from "./errors/index.ts";
export * from "./keys/index.ts";
export * from "./pipeline/index.ts";
export * from "./schema/index.ts";
export * from "./session/index.ts";
export { FLUXNODE_CORE_TOOL_POLICIES, FLUXNODE_PROMPT_SECTIONS } from "@fluxiq/contracts/fluxnode";
export type { FluxNodeOptions, FluxNodeOverrides, FluxNodePromptSectionId, FluxNodeTextOverride } from "@fluxiq/contracts/fluxnode";
