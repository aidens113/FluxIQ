// A pinned FluxNode's held change (plan, N8): the code a run records when it would have changed the
// pinned Flow, the proposal it left for review, and what the result says about it.

import { z } from "zod";
import { fluxNodeFieldSchemas } from "../fields/index.ts";
import { FLUXNODE_RUN_PATH_KINDS } from "./path-kinds.ts";

/** The code a pinned FluxNode's run records when it would have changed the pinned Flow: the run still got its result, and the changed Flow waits as a proposal. */
export const FLUXNODE_PINNED_CHANGE_HELD = "fluxnode.pinned_change_held";

/**
 * A Flow a pinned FluxNode's run left changed, held for the developer to review (plan, N8):
 * - `proposalId`: what `fluxiq pin` names to adopt it;
 * - `flowId`: the Flow the run worked in, beside the pinned one;
 * - `stepsDigest`: the digest of its steps, which is its identity;
 * - `runId`, `path`, `proposedAt`: the run that made it, how, and when.
 */
export const fluxNodeFlowProposalSchema = z
  .object({
    proposalId: fluxNodeFieldSchemas.id,
    flowId: fluxNodeFieldSchemas.id,
    stepsDigest: fluxNodeFieldSchemas.sha256Hex,
    runId: fluxNodeFieldSchemas.id,
    path: z.enum(FLUXNODE_RUN_PATH_KINDS),
    proposedAt: fluxNodeFieldSchemas.epochMs
  })
  .strict();

export type FluxNodeFlowProposal = z.infer<typeof fluxNodeFlowProposalSchema>;

/**
 * A run of a pinned FluxNode: the pinned version it replayed (its number and its steps' digest),
 * and, when its repair or exploration would have changed that Flow, the change it held instead:
 * `code` is `fluxnode.pinned_change_held` and `proposal` names what waits for review.
 */
export const fluxNodeRunPinnedSchema = z
  .object({
    flowVersion: z.number().int().min(1),
    stepsDigest: fluxNodeFieldSchemas.sha256Hex,
    held: z.object({ code: z.literal(FLUXNODE_PINNED_CHANGE_HELD), message: fluxNodeFieldSchemas.personText, proposal: fluxNodeFlowProposalSchema }).strict().optional()
  })
  .strict();

export type FluxNodeRunPinned = z.infer<typeof fluxNodeRunPinnedSchema>;
