// Inputs of the Automation Studio endpoints that start, run, stop, hold and
// read a Flow's live runs (runtime sessions).

import { z } from "zod/v4";
import { programApiInput } from "../../input/index.ts";

const projectId = z.string().trim().min(1).describe("The project the Flow belongs to.");
const flowId = z.string().trim().min(1).describe("The Flow to run.");
const runId = z.string().trim().min(1).describe("The run.");
const inputs = z.record(z.string(), z.unknown()).optional().describe("Values for the Flow's inputs, by input name.");

/** `start-runtime-session`: starts a run of a Flow without executing it yet. */
export const startRuntimeSessionInput = programApiInput(z.object({ projectId, flowId, inputs }));

/** `run-runtime-session`: runs a Flow to its end, or carries on a run that stopped part way. */
export const runRuntimeSessionInput = programApiInput(z.object({
  projectId,
  flowId,
  inputs,
  runId: runId.optional().describe("An earlier run to carry on from; leave out to start a new run."),
  maxSteps: z.number().int().min(1).max(10000).optional().describe("The most steps the run may take.")
}));

/** `cancel-runtime-session`: stops a run. */
export const cancelRuntimeSessionInput = programApiInput(z.object({
  projectId,
  runId,
  reason: z.string().max(500).optional().describe("Why the run is being stopped.")
}));

/** `pause-runtime-session`: holds a live run where it is. */
export const pauseRuntimeSessionInput = programApiInput(z.object({
  projectId,
  runId,
  takeControl: z.boolean().optional().describe("True when the person wants to use the run's page themselves while it is held."),
  reason: z.string().max(500).optional().describe("Why the run is being held.")
}));

/** `resume-runtime-session`: lets a held run go on. */
export const resumeRuntimeSessionInput = programApiInput(z.object({
  projectId,
  runId,
  afterManualAction: z.boolean().optional().describe("True when the person did something on the run's page by hand while it was held."),
  note: z.string().max(500).optional().describe("A note for the run, such as what the person did.")
}));

/** `get-runtime-run-control`: whether a run is held, and its progress. */
export const getRuntimeRunControlInput = programApiInput(z.object({ projectId, runId }));

/** `list-runtime-sessions`: a page of the project's runs, newest first. */
export const listRuntimeSessionsInput = programApiInput(z.object({
  projectId,
  flowId: flowId.optional().describe("Only this Flow's runs; leave out for every Flow in the project."),
  statuses: z.array(z.enum(["queued", "running", "waiting", "succeeded", "failed", "cancelled", "interrupted"])).optional().describe("Only runs in one of these states."),
  runIds: z.array(z.string().trim().min(1)).optional().describe("Only these runs."),
  limit: z.number().int().min(1).max(200).optional().describe("The most runs to return in one page."),
  cursor: z.string().optional().describe("The cursor a previous page gave for the next page.")
}));

/** `get-runtime-session`: one run, with its steps and what it found. */
export const getRuntimeSessionInput = programApiInput(z.object({ projectId, runId }));

export type StartRuntimeSessionInput = ReturnType<typeof startRuntimeSessionInput.parse>;
export type RunRuntimeSessionInput = ReturnType<typeof runRuntimeSessionInput.parse>;
export type CancelRuntimeSessionInput = ReturnType<typeof cancelRuntimeSessionInput.parse>;
export type PauseRuntimeSessionInput = ReturnType<typeof pauseRuntimeSessionInput.parse>;
export type ResumeRuntimeSessionInput = ReturnType<typeof resumeRuntimeSessionInput.parse>;
export type GetRuntimeRunControlInput = ReturnType<typeof getRuntimeRunControlInput.parse>;
export type ListRuntimeSessionsInput = ReturnType<typeof listRuntimeSessionsInput.parse>;
export type GetRuntimeSessionInput = ReturnType<typeof getRuntimeSessionInput.parse>;
