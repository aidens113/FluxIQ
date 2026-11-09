// A finished pipeline: the contracts' definition, and the functions its steps call.

import type { DataPipeline } from "@fluxiq/contracts/fluxnode";
import type { TransformFunction } from "../client/index.ts";

/**
 * - `definition`: the pipeline as the contracts describe it, validated, with every
 *   default filled; it is what the engine compiles to a Flow (plan, D3);
 * - `callbacks`: the transforms and sinks written as functions, by the callback name
 *   the definition uses; pass them as `transforms` when running.
 */
export type BuiltPipeline = { readonly definition: DataPipeline; readonly callbacks: Readonly<Record<string, TransformFunction>> };
