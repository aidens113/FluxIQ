import type { DataPipeline } from "@fluxiq/contracts/fluxnode";
import type { FluxNodeRegisteredSpec } from "../owner-flows.ts";

/** A data pipeline at one hash, and its Flow: filed and found by name beside the FluxNodes, which it runs as. */
export type FluxNodeRegisteredPipeline = Omit<FluxNodeRegisteredSpec, "spec"> & { pipeline: DataPipeline };
