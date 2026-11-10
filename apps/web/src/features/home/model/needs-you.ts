import type { HomeRun, HomeThread } from "./types";

export type NeedsYouItem = { key: string; text: string; href: string; openLabel: string };

type RepeatedFailure = { flowId: string; flowName: string; latestRunId: string; count: number };

/** Where a waiting question lives: its Flow or run when it has one, else the Flows page. */
function linkFor(thread: HomeThread): string {
  if (thread.subjectKind === "run" && thread.subjectId) return `/runs/${encodeURIComponent(thread.subjectId)}`;
  if ((thread.subjectKind === "flow" || thread.subjectKind === "build") && thread.subjectId) return `/flows/${encodeURIComponent(thread.subjectId)}`;
  return "/flows";
}

const FAILED = new Set(["failed", "interrupted"]);

/** Flows whose newest runs all failed, with how many in a row (at least two). */
function repeatedFailures(runs: readonly HomeRun[]): RepeatedFailure[] {
  const byFlow = new Map<string, HomeRun[]>();
  for (const run of [...runs].sort((a, b) => b.startedAt - a.startedAt)) byFlow.set(run.flowId, [...(byFlow.get(run.flowId) ?? []), run]);
  const found: RepeatedFailure[] = [];
  for (const [flowId, flowRuns] of byFlow) {
    let count = 0;
    while (count < flowRuns.length && FAILED.has(flowRuns[count]!.status)) count += 1;
    if (count >= 2) found.push({ flowId, flowName: flowRuns[0]!.flowName, latestRunId: flowRuns[0]!.runId, count });
  }
  return found.sort((a, b) => b.count - a.count);
}

/** Open questions first, then Flows that keep failing. Each has a plain sentence and an Open link. */
export function needsYouItems(threads: readonly HomeThread[], runs: readonly HomeRun[], flowNames: ReadonlyMap<string, string> = new Map()): NeedsYouItem[] {
  const questions = threads
    .filter((thread) => thread.status === "open" && thread.pendingAskCount > 0)
    .map((thread): NeedsYouItem => {
      const named = thread.subjectKind === "flow" || thread.subjectKind === "build" ? flowNames.get(thread.subjectId) : undefined;
      const subject = named ?? thread.title;
      return {
        key: `ask:${thread.conversationId}`,
        text: subject ? `"${subject}" is waiting for your answer` : "A question is waiting for your answer",
        href: linkFor(thread),
        openLabel: subject ? `Open ${subject}` : "Open the question"
      };
    });
  const failing = repeatedFailures(runs).map((item): NeedsYouItem => ({
    key: `fail:${item.flowId}`,
    text: `"${item.flowName}" failed its last ${item.count} runs`,
    href: `/runs/${encodeURIComponent(item.latestRunId)}`,
    openLabel: `Open the latest failed run of ${item.flowName}`
  }));
  return [...questions, ...failing];
}
