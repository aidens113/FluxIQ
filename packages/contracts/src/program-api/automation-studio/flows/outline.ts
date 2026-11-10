// Inputs of the Automation Studio endpoints that show a Flow as a plain numbered list of steps and change it
// from that list. The Flow outline editor and the panel assistant send them.

import { z } from "zod/v4";
import { programApiInput } from "../../input/index.ts";
import { graphPatchOperation } from "../graph/index.ts";

const projectId = z.string().trim().min(1).describe("The project the Flow belongs to.");
const flowId = z.string().trim().min(1).describe("The Flow.");
const step = z.string().trim().min(1).describe("A step's number as the list shows it, such as \"2\" or \"3.1\".");
const baseRevision = z.number().int().min(1).describe("The version number the list showed when the person started editing.");
const value = z.unknown().describe("The new value.");

/** One change made on the list of steps, naming steps by their numbers. */
export const flowStepEdit = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("set-words"), step, words: z.string().trim().min(1).max(200).describe("The step's new wording.") }),
  z.object({ kind: z.literal("set-value"), step, path: z.array(z.string()).describe("Where inside the step's settings the value goes."), value }),
  z.object({ kind: z.literal("bind-input"), step, path: z.array(z.string()).describe("Where inside the step's settings the value goes."), input: z.string().trim().min(1).describe("The Flow input to read the value from.") }),
  z.object({ kind: z.literal("move"), step, direction: z.enum(["up", "down"]).describe("Which way to move the step within its own part of the list.") }),
  z.object({ kind: z.literal("delete"), step }),
  z.object({
    kind: z.literal("add-call"),
    after: step.optional().describe("The step to add the new one after; first when left out."),
    flow: z.object({ flowId: z.string().trim().min(1).describe("The Flow to run."), name: z.string().trim().min(1).describe("The Flow's name.") }),
    nodeId: z.string().trim().min(1).optional().describe("An id for the new step; one is made when left out.")
  }),
  z.object({
    kind: z.literal("add-data"),
    after: step.optional().describe("The step to add the new one after; first when left out."),
    data: z.object({ kind: z.enum(["filter", "sort", "limit", "dedupe", "sink"]).describe("Which kind of data step to add.") }).catchall(z.unknown()).describe("The data step's settings."),
    nodeId: z.string().trim().min(1).optional().describe("An id for the new step; one is made when left out.")
  })
]);

/** `get-flow-outline`: a Flow's steps as a numbered list, with the version number edits are made against. */
export const getFlowOutlineInput = programApiInput(z.object({ projectId, flowId }));

/** `edit-flow-steps`: one change made on the list of steps, saved as a new version of the Flow. */
export const editFlowStepsInput = programApiInput(z.object({
  projectId,
  flowId,
  baseRevision,
  edit: flowStepEdit.describe("The change, naming steps by the numbers the list shows."),
  via: z.enum(["assistant"]).optional().describe("Left out when a person edits the list; \"assistant\" when the assistant makes the change.")
}));

/** `undo-flow-edit`: puts back what one saved change replaced, as a new version. */
export const undoFlowEditInput = programApiInput(z.object({
  projectId,
  flowId,
  baseRevision: baseRevision.describe("The version number the change produced."),
  inverseOperations: z.array(graphPatchOperation).min(1).describe("The undo edits a saved change returned."),
  message: z.string().max(500).optional().describe("A short note for the history, in plain words.")
}));
