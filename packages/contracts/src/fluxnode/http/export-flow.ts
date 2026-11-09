// POST fluxnodes/{name}/export: export a FluxNode's learned Flow as a reviewable
// document, and pin it when asked (plan, N8). `fluxiq pin` writes the document to a
// file in the developer's repository. A pinned FluxNode replays exactly that Flow, and
// its repairs wait as proposals until the developer pins again.

import { z } from "zod";
import { fluxNodeFieldSchemas } from "../fields/index.ts";
import { flowPathSchema, fluxNodeNameSchema } from "../flow/index.ts";
import { jsonObjectSchema } from "../json/index.ts";

/** The request body: which spec's Flow (the latest when absent), and whether to pin it. */
export const fluxNodeExportFlowRequestSchema = z.object({ specHash: fluxNodeFieldSchemas.sha256Hex.optional(), pin: z.boolean().default(false) }).strict();

export type FluxNodeExportFlowRequest = z.infer<typeof fluxNodeExportFlowRequestSchema>;

/** The format tag every export carries, so a file read back is known for what it is. */
export const FLUXNODE_FLOW_EXPORT_FORMAT = "fluxiq.fluxnode-flow";

/**
 * The exported Flow: which FluxNode and spec it serves, the Flow's id, path and
 * version, whether it is now pinned, when it was exported, and the Flow document
 * itself, which this contract carries without reading.
 */
export const fluxNodeFlowExportSchema = z
  .object({
    format: z.literal(FLUXNODE_FLOW_EXPORT_FORMAT),
    formatVersion: z.literal(1),
    name: fluxNodeNameSchema,
    specHash: fluxNodeFieldSchemas.sha256Hex,
    flowId: fluxNodeFieldSchemas.id,
    flowPath: flowPathSchema,
    flowVersion: z.number().int().min(1),
    pinned: z.boolean(),
    exportedAt: fluxNodeFieldSchemas.epochMs,
    flow: jsonObjectSchema
  })
  .strict();

export type FluxNodeFlowExport = z.infer<typeof fluxNodeFlowExportSchema>;
