import { agoText, runResult } from "../../home/model";
import type { FlowSummary, RunSummary } from "../wire";
import { flowHref } from "./flow-href";
import type { FlowRow } from "./types";

/**
 * The project's Flows as the list shows them: those whose name or description holds every
 * word searched for, each with its latest run, the most recently used first.
 */
export function listedFlows(flows: readonly FlowSummary[], runs: readonly RunSummary[], search: string, projectId: string, now: number): FlowRow[] {
  const latest = new Map<string, RunSummary>();
  for (const run of runs) {
    const seen = latest.get(run.flowId);
    if (!seen || run.startedAt > seen.startedAt) latest.set(run.flowId, run);
  }
  const words = search.toLowerCase().split(/\s+/u).filter(Boolean);
  const matches = (flow: FlowSummary) => {
    const text = `${flow.name} ${flow.description}`.toLowerCase();
    return words.every((word) => text.includes(word));
  };
  const lastUsed = (flow: FlowSummary) => Math.max(flow.updatedAt, latest.get(flow.flowId)?.startedAt ?? 0);
  return flows
    .filter(matches)
    .sort((a, b) => lastUsed(b) - lastUsed(a) || a.name.localeCompare(b.name))
    .map((flow) => {
      const row: FlowRow = { flowId: flow.flowId, name: flow.name, description: flow.description, href: flowHref(flow.flowId, projectId) };
      const run = latest.get(flow.flowId);
      if (run) {
        const result = runResult(run.status);
        row.lastRun = { label: result.label, tone: result.tone, ago: agoText(run.startedAt, now), runHref: `/runs/${encodeURIComponent(run.runId)}` };
      }
      return row;
    });
}
