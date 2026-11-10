import { asRecord, numberOf, textOf } from "../../home/model";
import type { FlowSummary } from "./types";

/**
 * `list-flow-summaries`' Flows a person opens: a Subflow's own graph is part of its parent
 * Flow, so it is not listed on its own. Undefined when the answer has no list.
 */
export function flowSummaries(payload: unknown): FlowSummary[] | undefined {
  const flows = asRecord(payload)?.flows;
  if (!Array.isArray(flows)) return undefined;
  return flows.flatMap((value): FlowSummary[] => {
    const row = asRecord(value);
    const flowId = textOf(row?.flowId);
    if (!row || !flowId || row.subflowGraph === true) return [];
    return [{ flowId, name: textOf(row.name) ?? "A Flow with no name", description: textOf(row.description) ?? "", updatedAt: numberOf(row.updatedAt) ?? 0 }];
  });
}
