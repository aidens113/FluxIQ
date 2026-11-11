// POST fluxnodes/{name}/export: export a FluxNode's learned Flow as a reviewable
// document, and pin it when asked (plan, N8). `fluxiq pin` writes the document to a
// file in the developer's repository. A pinned FluxNode replays exactly that Flow, and
// its repairs wait as proposals until the developer pins again.

import { z } from "zod";
import { fluxNodeFieldSchemas } from "../fields/index.ts";
import { flowPathSchema, fluxNodeNameSchema } from "../flow/index.ts";
import { jsonObjectSchema } from "../json/index.ts";
import { fluxNodeFlowProposalSchema } from "../run/index.ts";

/**
 * The request body: which spec's Flow (the latest when absent), whether to pin it, and which
 * waiting proposal to adopt with the pin (`proposal`; the newest when absent and one waits).
 */
export const fluxNodeExportFlowRequestSchema = z.object({ specHash: fluxNodeFieldSchemas.sha256Hex.optional(), pin: z.boolean().default(false), proposal: fluxNodeFieldSchemas.id.optional() }).strict();

export type FluxNodeExportFlowRequest = z.infer<typeof fluxNodeExportFlowRequestSchema>;

/** The format tag every export carries, so a file read back is known for what it is. */
export const FLUXNODE_FLOW_EXPORT_FORMAT = "fluxiq.fluxnode-flow";

/**
 * The exported Flow: which FluxNode and spec it serves, the Flow's id, path and
 * version, whether it is now pinned, when it was exported, and the Flow document
 * itself, which this contract carries without reading. `stepsDigest` is the
 * version's identity (the digest of the steps a replay runs); `proposals` are the
 * changes a pinned FluxNode's runs held, oldest first, each waiting for a pin.
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
    stepsDigest: fluxNodeFieldSchemas.sha256Hex.optional(),
    proposals: z.array(fluxNodeFlowProposalSchema).max(64).optional(),
    flow: jsonObjectSchema
  })
  .strict();

export type FluxNodeFlowExport = z.infer<typeof fluxNodeFlowExportSchema>;
