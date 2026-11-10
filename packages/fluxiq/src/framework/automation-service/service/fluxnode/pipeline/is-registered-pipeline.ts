import type { FluxNodeRegistered } from "./registered.ts";
import type { FluxNodeRegisteredPipeline } from "./registered-pipeline.ts";

export function isRegisteredPipeline(registered: FluxNodeRegistered): registered is FluxNodeRegisteredPipeline {
  return "pipeline" in registered;
}
