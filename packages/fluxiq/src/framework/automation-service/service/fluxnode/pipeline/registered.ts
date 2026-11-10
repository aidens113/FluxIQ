import type { FluxNodeRegisteredSpec } from "../owner-flows.ts";
import type { FluxNodeRegisteredPipeline } from "./registered-pipeline.ts";

/** Anything registered by name: a FluxNode at its spec, or a data pipeline. */
export type FluxNodeRegistered = FluxNodeRegisteredSpec | FluxNodeRegisteredPipeline;
