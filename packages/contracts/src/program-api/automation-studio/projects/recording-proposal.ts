// Inputs of the Automation Studio endpoints that turn a recording into a proposed Flow and review it.

import { z } from "zod/v4";
import { programApiInput } from "../../input/index.ts";

const projectId = z.string().trim().min(1).describe("The project.");
const proposalId = z.string().trim().min(1).describe("The proposal.");

/** `get-proposal`: one proposal. */
export const getProposalInput = programApiInput(z.object({
  projectId,
  proposalId,
  kind: z.enum(["policy", "recording_flow", "auto"]).optional().describe("Which kind of proposal it is; leave out to find it.")
}));

/** `generate-recording-proposal`: a proposed Flow made from a recording. */
export const generateRecordingProposalInput = programApiInput(z.object({
  projectId,
  recordingId: z.string().trim().min(1).describe("The recording to make the proposal from."),
  mode: z.enum(["direct", "llm_assisted"]).optional().describe("direct copies the recorded steps; llm_assisted lets a model tidy them, which costs money."),
  title: z.string().optional().describe("A name for the proposal."),
  instructions: z.string().optional().describe("What the Flow should do, in plain words."),
  constraints: z.string().optional().describe("Anything the Flow must not do."),
  replaceProposalId: z.string().trim().min(1).optional().describe("An earlier proposal this one replaces.")
}));

/** `review-recording-flow-proposal`: approve or reject a proposed Flow. */
export const reviewRecordingFlowProposalInput = programApiInput(z.object({
  projectId,
  proposalId,
  decision: z.enum(["approved", "rejected"]).describe("Whether to approve or reject the proposal."),
  notes: z.string().optional().describe("A note about the decision.")
}));

export type GetProposalInput = ReturnType<typeof getProposalInput.parse>;
export type GenerateRecordingProposalInput = ReturnType<typeof generateRecordingProposalInput.parse>;
export type ReviewRecordingFlowProposalInput = ReturnType<typeof reviewRecordingFlowProposalInput.parse>;
