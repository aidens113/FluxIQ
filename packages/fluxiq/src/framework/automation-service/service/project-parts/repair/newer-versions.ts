// What one run may try in place of a pinned version that failed. Newer, the same interface,
// whose most recent verdict is not a failure, able to run, and not one that already failed in
// this run: a version that passed serves the run again, one that failed is never tried twice.
// Everything here fails closed: a library that cannot be reached offers nothing, and an act it cannot tell about may have landed.
import type { AutomationStudioPartPin, AutomationStudioNewerPartVersions } from "../../../../../engine/automation/frames/index.ts";
import { automationStudioAssessAttemptFault, type AutomationStudioGraphExecutionOptions, type AutomationStudioNodeAttemptTrace } from "../../../executor/index.ts";
import type { AutomationStudioFlowDocument } from "../../../../../flows/authoring/model/index.ts";
import { automationStudioAttemptsMayHaveActedLastingly } from "../../../../../runtime/adaptation/flow-change/index.ts";
import type { AutomationStudioProjectDatabasePool } from "../../../../persistence/automation/index.ts";
import { withProjectPartStores } from "../stores.ts";
import { projectPartSameInterface } from "../part-interface.ts";

type VersionsInput = {
  pool: AutomationStudioProjectDatabasePool | undefined;
  projectId: string;
  /** Whether a version and all it calls can be read and run. */
  canRun(pin: AutomationStudioPartPin): Promise<boolean>;
};

const key = (pin: AutomationStudioPartPin): string => `${pin.partId}@${pin.version}`;

/** One run's reading of the library. What has failed in it, and the parts it stopped trying, are this run's. */
export function projectPartNewerVersionsOfRun(input: VersionsInput): { of(pin: AutomationStudioPartPin, graph: Pick<AutomationStudioFlowDocument, "nodes">): AutomationStudioNewerPartVersions } {
  const failedHere = new Set<string>();
  const stopped = new Set<string>();
  let triedByRun: string | undefined;
  return {
    of(pinned, graph) {
      const landed = (attempts: readonly AutomationStudioNodeAttemptTrace[], flow: Pick<AutomationStudioFlowDocument, "nodes">, options: AutomationStudioGraphExecutionOptions) => mayHaveLanded(attempts, flow, options);
      return {
        candidates: async () => (stopped.has(pinned.partId) ? [] : (await candidatesOf(input, pinned)).filter((pin) => !failedHere.has(key(pin)))),
        mayHaveLanded: (attempts, options) => landed(attempts, graph, options),
        taken: (_pin, runId) => {
          triedByRun = runId;
        },
        failed: async (pin, attempts, options) => {
          failedHere.add(key(pin));
          const mayHave = await landed(attempts, graph, options);
          if (mayHave) stopped.add(pin.partId);
          await recordFailure(input, pin, triedByRun);
          return mayHave;
        }
      };
    }
  };
}

/** Whether attempts of one version may have done something lasting, by `lasting-acts.ts`. A failed step that surely did nothing did not: the engine retries such a step itself. */
async function mayHaveLanded(attempts: readonly AutomationStudioNodeAttemptTrace[], flow: Pick<AutomationStudioFlowDocument, "nodes">, options: AutomationStudioGraphExecutionOptions): Promise<boolean> {
  try {
    const counted = attempts.filter((attempt) => !surelyDidNothing(attempt, flow, options));
    return await automationStudioAttemptsMayHaveActedLastingly({ flow, attempts: counted, resolveActionEffect: options.resolveActionEffect, subflowGraphs: options.subflowGraphs });
  } catch {
    return true;
  }
}

/** A failed step the engine itself reads as having acted on nothing, and not found so only after it acted. A call step is never this: what it called may have acted. */
function surelyDidNothing(attempt: AutomationStudioNodeAttemptTrace, flow: Pick<AutomationStudioFlowDocument, "nodes">, options: AutomationStudioGraphExecutionOptions): boolean {
  if (attempt.status !== "failed" || attempt.childTrace || attempt.effectCheck?.result === "unknown" || attempt.effectCheck?.result === "landed") return false;
  const node = flow.nodes.find((held) => held.id === attempt.nodeId);
  if (!node) return false;
  const fault = automationStudioAssessAttemptFault(attempt, node, 0, options.resolveActionEffect?.(node));
  const stage = fault?.stage ?? attempt.failure?.stage;
  return fault?.effect === "unacted" && fault.actUncertain !== true && stage !== "confirmation" && stage !== "verification";
}

/** Newest first. A library that cannot be reached offers nothing. */
async function candidatesOf(input: VersionsInput, pinned: AutomationStudioPartPin): Promise<AutomationStudioPartPin[]> {
  const listed = await withProjectPartStores(input.pool, input.projectId, async (stores) => {
    const record = await stores.parts.getVersion(pinned.partId, pinned.version);
    const card = record ? await stores.cardOf(record) : undefined;
    if (!card) return [];
    const pins: AutomationStudioPartPin[] = [];
    for (const newer of await stores.parts.listVersions(pinned.partId)) {
      if (newer.version <= pinned.version) continue;
      const newerCard = await stores.cardOf(newer);
      if (newerCard && projectPartSameInterface(card, newerCard) && (await stores.verdictOf(newer)) !== "failed") pins.push({ partId: pinned.partId, version: newer.version });
    }
    return pins;
  });
  if (!Array.isArray(listed)) return [];
  const runnable: AutomationStudioPartPin[] = [];
  for (const pin of listed) if (await input.canRun(pin)) runnable.push(pin);
  return runnable;
}

/** The failure is that version's alone. It is said on the record a part's own run writes, so the card shows it and the next run does not try it. A write that fails changes nothing about this run. */
async function recordFailure(input: VersionsInput, pin: AutomationStudioPartPin, runId: string | undefined): Promise<void> {
  if (!runId) return;
  await withProjectPartStores(input.pool, input.projectId, (stores) => stores.parts.recordRun({ partId: pin.partId, version: pin.version, runId, outcome: "failed", modelCalls: 0, finishedAtMs: Date.now() })).catch(/* best-effort: this run goes on whatever the record says */ () => undefined);
}
