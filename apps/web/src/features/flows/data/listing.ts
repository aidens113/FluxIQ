import type { ProgramCommandTransport } from "../../automation-studio/data/program-transport";
import { flowSummaries, runSummaries, type FlowSummary, type RunSummary } from "../wire";

/** The most runs read for the list: the API's largest page, newest first, enough for each Flow's latest. */
const RUNS_READ = 200;

/** The project's Flows, and their runs when those could be read (`runs` is absent when they could not). */
export type FlowListing = { flows: FlowSummary[]; runs?: RunSummary[] };

/** Throws when the Flows cannot be read; a list that cannot say how runs went still lists the Flows. */
export async function loadFlowListing(studio: ProgramCommandTransport, projectId: string, signal: AbortSignal): Promise<FlowListing> {
  const [flowsAnswer, runsAnswer] = await Promise.all([
    studio.post("list-flow-summaries", { projectId }, { signal }),
    studio.post("list-flow-runs", { projectId, limit: RUNS_READ, sort: "started", direction: "desc" }, { signal })
  ]);
  const flows = flowsAnswer.ok ? flowSummaries(flowsAnswer.payload) : undefined;
  if (!flows) throw new Error(flowsAnswer.error ?? "The Flows could not be read.");
  const runs = runsAnswer.ok ? runSummaries(runsAnswer.payload) : undefined;
  return runs ? { flows, runs } : { flows };
}
