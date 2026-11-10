// Input of the Automation Studio endpoint that applies edits to a Flow's graph. The graph editor and the
// Flow outline send it; the panel assistant does not call it directly, so it is declared hidden.

import { z } from "zod/v4";
import { programApiInput } from "../../input/index.ts";

const nodeId = z.string().trim().min(1).describe("The step the edit applies to.");

/** One edit to a Flow's graph. */
export const graphPatchOperation = z.discriminatedUnion("op", [
  z.object({ op: z.literal("add_node"), node: z.record(z.string(), z.unknown()).describe("The new step.") }),
  z.object({ op: z.literal("move_node"), nodeId, x: z.number(), y: z.number() }),
  z.object({ op: z.literal("set_node_parameters"), nodeId, values: z.record(z.string(), z.unknown()).describe("The step's new settings, replacing the old ones.") }),
  z.object({ op: z.literal("set_node_label"), nodeId, label: z.string().trim().min(1).max(200).describe("The step's new wording.") }),
  z.object({ op: z.literal("delete_node"), nodeId }),
  z.object({ op: z.literal("add_edge"), edge: z.record(z.string(), z.unknown()).describe("The new connection between two steps.") }),
  z.object({ op: z.literal("delete_edge"), edgeId: z.string().trim().min(1).describe("The connection to remove.") })
]);

/** `apply-graph-patch`: a batch of edits applied on top of a version the editor last saw. */
export const applyGraphPatchInput = programApiInput(z.object({
  projectId: z.string().trim().min(1).describe("The project the Flow belongs to."),
  flowId: z.string().trim().min(1).describe("The Flow to change."),
  baseRevision: z.number().int().min(1).describe("The version of the Flow the edits were made against."),
  mutationId: z.string().trim().min(1).describe("A unique id for this save, so sending it twice changes the Flow once."),
  operations: z.array(graphPatchOperation).min(1).describe("The edits, applied in order."),
  message: z.string().max(500).optional().describe("A short note for the history, in plain words."),
  madeBy: z.enum(["person", "repair", "assistant"]).optional().describe("Who made the change; a person when left out.")
}));

export type ApplyGraphPatchInput = ReturnType<typeof applyGraphPatchInput.parse>;
