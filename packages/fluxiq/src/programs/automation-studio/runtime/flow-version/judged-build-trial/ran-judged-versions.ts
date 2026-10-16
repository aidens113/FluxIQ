import type { AutomationStudioFlowGraphVersion } from "../contracts.ts";

/**
 * Whether a run executed exactly the graph versions a judged trial's record
 * names: every graph the run entered is one apply saved, at the revision apply
 * saved it, and at least one of them by a revision number. A graph is named by
 * its own Flow id, which no other graph shares.
 *
 * A `null` revision (a graph with no chain yet: `../contracts.ts`) matches only
 * where the record names the orchestration Flow itself, and only `null`
 * against `null`. Apply indexes every Subflow graph it saves, so a Subflow is
 * always compared by number; the parent's chain starts only when its graph is
 * first viewed or patched, and either numbers it, which then no longer matches
 * the recorded `null`. That is the direction a doubt has to fall: the record
 * stops speaking for the run, and the run's double no is judged as it always
 * was.
 */
export function automationStudioRanJudgedVersions(
  judged: readonly AutomationStudioFlowGraphVersion[],
  ran: readonly AutomationStudioFlowGraphVersion[]
): boolean {
  if (!ran.length) return false;
  const saved = new Map(judged.map((version) => [version.graphFlowId, version]));
  let numbered = 0;
  for (const version of ran) {
    const own = saved.get(version.graphFlowId);
    if (!own) return false;
    if (version.revision === null) {
      if (own.revision !== null || own.subflowId !== undefined) return false;
      continue;
    }
    if (own.revision !== version.revision) return false;
    numbered += 1;
  }
  return numbered > 0;
}
