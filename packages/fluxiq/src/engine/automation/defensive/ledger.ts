import type { AutomationStudioFaultAssessment } from "./contracts.ts";
import { AUTOMATION_STUDIO_MAX_RUN_RETRY_WAIT_MS } from "./retry-wait.ts";

/** How many fault entries one run keeps in full. Past this the count still rises; the list stops growing. */
const MAXIMUM_LEDGER_ENTRIES = 200;

/** What the run did about one fault. */
export type AutomationStudioDefenceOutcome =
  /** Absorbed: the node was attempted again. */
  | "retried"
  /** Absorbed: the node was left failed and the Flow carried on past it. */
  | "continued"
  /** Not absorbed: the fault ended the run, or the Flow's own error handling took over. */
  | "stopped";

/** One fault the run met, and what became of it. */
export type AutomationStudioDefenceEntry = {
  nodeId: string;
  attemptId: string;
  /** Which attempt of this node met the fault, counting from one. */
  attemptNumber: number;
  outcome: AutomationStudioDefenceOutcome;
  category: AutomationStudioFaultAssessment["category"];
  code: string;
  source: AutomationStudioFaultAssessment["source"];
  effect: AutomationStudioFaultAssessment["effect"];
  reason: string;
  /** What absorbing this fault cost in waiting, in milliseconds. */
  waitedMs: number;
  hintedWaitMs?: number;
  httpStatus?: number;
};

/**
 * What one run survived, carried on its trace.
 *
 * A fault that was absorbed and left no mark is the failure mode this repository
 * keeps meeting: a reason computed and discarded, a run that looks clean and a
 * person who cannot tell a first-attempt success from a third. Every assessment
 * lands here, absorbed or not.
 */
export type AutomationStudioDefenceSummary = {
  /** Faults the run absorbed, by attempting again or by carrying on past the node. */
  absorbedCount: number;
  /** Faults the run declined to absorb. */
  refusedCount: number;
  /** Faults met in total, which exceeds `entries.length` once the entry list is full. */
  faultCount: number;
  /** What absorbing them cost in waiting, in milliseconds. */
  waitedMs: number;
  /** The whole-run waiting allowance those milliseconds are spent from. */
  waitBudgetMs: number;
  entries: AutomationStudioDefenceEntry[];
  /** Nodes whose failure the Flow was allowed to walk past, in the order it did. */
  continuedPastNodeIds?: string[];
};

/** The run-scoped record of every fault met, and the waiting allowance spent on them. */
export type AutomationStudioDefenceLedger = {
  record: (entry: AutomationStudioDefenceEntry) => void;
  /** Notes that the Flow carried on past this node's final failure. */
  continuePast: (nodeId: string) => void;
  /** Waiting spent absorbing faults at one arrival at one node, keyed by attempt id of the first failure. */
  nodeWaitedMs: (nodeId: string) => number;
  runWaitedMs: () => number;
  /** Clears the per-node waiting tally, called when the run moves to a different node. */
  leaveNode: () => void;
  summary: () => AutomationStudioDefenceSummary | undefined;
};

export function automationStudioDefenceLedger(): AutomationStudioDefenceLedger {
  const entries: AutomationStudioDefenceEntry[] = [];
  const continuedPastNodeIds: string[] = [];
  let faultCount = 0;
  let absorbedCount = 0;
  let refusedCount = 0;
  let runWaited = 0;
  let nodeWaited = 0;
  let nodeWaitedFor: string | undefined;
  return {
    record: (entry) => {
      faultCount += 1;
      if (entry.outcome === "stopped") refusedCount += 1;
      else absorbedCount += 1;
      runWaited += Math.max(0, entry.waitedMs);
      if (nodeWaitedFor !== entry.nodeId) {
        nodeWaitedFor = entry.nodeId;
        nodeWaited = 0;
      }
      nodeWaited += Math.max(0, entry.waitedMs);
      if (entries.length < MAXIMUM_LEDGER_ENTRIES) entries.push(entry);
    },
    continuePast: (nodeId) => {
      if (!continuedPastNodeIds.includes(nodeId)) continuedPastNodeIds.push(nodeId);
    },
    nodeWaitedMs: (nodeId) => (nodeWaitedFor === nodeId ? nodeWaited : 0),
    runWaitedMs: () => runWaited,
    leaveNode: () => {
      nodeWaitedFor = undefined;
      nodeWaited = 0;
    },
    summary: () => {
      if (!faultCount) return undefined;
      return {
        absorbedCount,
        refusedCount,
        faultCount,
        waitedMs: runWaited,
        waitBudgetMs: AUTOMATION_STUDIO_MAX_RUN_RETRY_WAIT_MS,
        entries: [...entries],
        ...(continuedPastNodeIds.length ? { continuedPastNodeIds: [...continuedPastNodeIds] } : {})
      };
    }
  };
}
