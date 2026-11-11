// A FluxNode's pin as its Flow keeps it (fluxnode-plan N8): in the Flow's `fluxNode` metadata
// (`../owner-flows.ts`), so it is read back from the Flow after a restart.
//
//   fluxNode.versions   the steps' digest of every version pinned, oldest first: a version's number is its place
//   fluxNode.pin        the pinned version: its number, its steps' digest, when, the saved Flow a replay runs,
//                       the Flow its runs work in, and the proposals they held, oldest first
//
// **A record that does not read is no pin**, and a proposal or a saved Flow that does not read is left out
// (the rest stands), as the task memory reads its own (`../../answer-first/task-memory/store.ts`).

import { fluxNodeFlowProposalSchema, type FluxNodeFlowProposal } from "@fluxiq/contracts/fluxnode";
import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import type { AutomationStudioAnswerFirstSavedFlow } from "../../answer-first/task-memory/index.ts";

/** A proposal as the pin keeps it: what the contract says of it, and the Flow itself. */
export type FluxNodePinProposal = FluxNodeFlowProposal & { saved: AutomationStudioAnswerFirstSavedFlow };

export type FluxNodePinRecord = {
  flowVersion: number;
  stepsDigest: string;
  pinnedAt: number;
  /** The Flow a pinned replay runs. Absent where nothing was learned when it was pinned: a pinned run then explores, and what it finds is held. */
  saved?: AutomationStudioAnswerFirstSavedFlow | undefined;
  /** The Flow a pinned FluxNode's runs work in, beside the pinned one, once one ran. */
  proposalFlowId?: string | undefined;
  proposals: FluxNodePinProposal[];
};

const isObject = (value: unknown): value is JsonObject => typeof value === "object" && value !== null && !Array.isArray(value);

/** The pin `said` holds, or none. */
export function fluxNodePinRecordOf(said: JsonObject): FluxNodePinRecord | undefined {
  const held = said.pin;
  if (!isObject(held) || typeof held.flowVersion !== "number" || !Number.isInteger(held.flowVersion) || held.flowVersion < 1 || typeof held.stepsDigest !== "string" || typeof held.pinnedAt !== "number") return undefined;
  const saved = savedOf(held.saved);
  const proposals = Array.isArray(held.proposals) ? held.proposals.flatMap((each) => proposalOf(each)) : [];
  return {
    flowVersion: held.flowVersion, stepsDigest: held.stepsDigest, pinnedAt: held.pinnedAt, ...(saved ? { saved } : {}),
    ...(typeof held.proposalFlowId === "string" ? { proposalFlowId: held.proposalFlowId } : {}), proposals
  };
}

/** The steps' digest of every version pinned, oldest first. */
export function fluxNodePinVersionsOf(said: JsonObject): string[] {
  return Array.isArray(said.versions) ? said.versions.filter((each): each is string => typeof each === "string") : [];
}

/** `said` holding `record` as its pin and `versions` as its versions. */
export function fluxNodePinSaid(said: JsonObject, record: FluxNodePinRecord, versions: readonly string[]): JsonObject {
  return { ...said, versions: [...versions], pin: JSON.parse(JSON.stringify(record)) as JsonValue };
}

function savedOf(value: unknown): AutomationStudioAnswerFirstSavedFlow | undefined {
  if (!isObject(value) || !Array.isArray(value.steps) || typeof value.stepsDigest !== "string" || typeof value.flowId !== "string" || typeof value.attemptId !== "string") return undefined;
  return value as unknown as AutomationStudioAnswerFirstSavedFlow;
}

function proposalOf(value: unknown): FluxNodePinProposal[] {
  if (!isObject(value)) return [];
  const { saved: kept, ...identity } = value;
  const parsed = fluxNodeFlowProposalSchema.safeParse(identity);
  const saved = savedOf(kept);
  return parsed.success && saved ? [{ ...parsed.data, saved }] : [];
}
