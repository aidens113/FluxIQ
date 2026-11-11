// The FluxNode runs this Core holds (fluxnode-plan N9), in memory: a run, its idempotency key and its
// resume handle live as long as the process. What survives a restart is what the attempts stored
// (the Flows, the task's learned Flow, the datasets), not the run records.
//
// - **Idempotency.** A key names one request: the same key with the same request is the run it
//   started; with another request it is refused.
// - **Resume.** A run that ended `budget_out` or `waiting_for_person` has a handle; continuing it is a
//   new run with the same FluxNode, spec, inputs and options, so it finds what the first one kept.
// - **One run at a time per Flow.** An attempt holds its Flow while it builds, so a second run of the
//   same FluxNode spec waits for the first; runs of other Flows go at once.
// - **Listing** is newest first, a page at a time; the cursor is the last run of the page.

import { canonicalJson, type FluxNodeListRunsQuery, type FluxNodeListRunsResponse } from "@fluxiq/contracts/fluxnode";
import type { JsonValue } from "../../../../core/index.ts";
import type { FluxNodeRun } from "./fluxnode-run.ts";
import type { FluxNodeRegistered } from "./pipeline/index.ts";

const RESUME_PREFIX = "resume.";

type Held = { run: FluxNodeRun; registered: FluxNodeRegistered; finished: Promise<void> };

export class FluxNodeRunRegistry {
  private readonly runs = new Map<string, Held>();
  private readonly newestFirst: string[] = [];
  private readonly keys = new Map<string, { runId: string; digest: string }>();
  private readonly flowTails = new Map<string, Promise<void>>();
  /** Per Flow: how many runs saved a learned Flow, and the latest one's candidate, for an export. */
  private readonly learnedOn = new Map<string, { versions: number; candidateId: string; revision?: number | undefined; digest?: string | undefined }>();
  /** Per Flow: the judge-part digest of the latest run that a judge confirmed, so changed criteria are judged once even on a replay. */
  private readonly judgedOn = new Map<string, string>();
  /** Per Flow: the version the program pinned, when it did. */
  private readonly pinnedOn = new Map<string, { flowVersion: number; at: number }>();

  /** The run an idempotency key started, when this request is the one it named; `conflict` when it named another. */
  keyed(key: string | undefined, request: unknown): { runId: string } | "conflict" | undefined {
    if (key === undefined) return undefined;
    const held = this.keys.get(key);
    if (!held) return undefined;
    return held.digest === digestOf(request) ? { runId: held.runId } : "conflict";
  }

  /** Holds `run` and starts `work` once its Flow is free. The key, when given, names this run from now on. */
  add(run: FluxNodeRun, registered: FluxNodeRegistered, work: () => Promise<void>, key?: { key: string; request: unknown }): void {
    const before = this.flowTails.get(registered.flowId) ?? Promise.resolve();
    const finished = before.then(work);
    this.flowTails.set(registered.flowId, finished.then(() => undefined, () => undefined));
    this.runs.set(run.runId, { run, registered, finished });
    this.newestFirst.unshift(run.runId);
    if (key) this.keys.set(key.key, { runId: run.runId, digest: digestOf(key.request) });
  }

  get(runId: string): Held | undefined {
    return this.runs.get(runId);
  }

  /** The handle that continues `runId`. */
  resumeHandleOf(runId: string): string {
    return `${RESUME_PREFIX}${runId}`;
  }

  /** The run a resume handle continues, when it is one this Core gave and that run can be continued. */
  resumable(handle: string): Held | undefined {
    if (!handle.startsWith(RESUME_PREFIX)) return undefined;
    const held = this.runs.get(handle.slice(RESUME_PREFIX.length));
    const status = held?.run.result?.status;
    return status === "budget_out" || status === "waiting_for_person" ? held : undefined;
  }

  learned(flowId: string, candidate: { candidateId: string; revision?: number | undefined; digest?: string | undefined }): void {
    const before = this.learnedOn.get(flowId);
    if (before?.candidateId === candidate.candidateId) return;
    this.learnedOn.set(flowId, { versions: (before?.versions ?? 0) + 1, ...candidate });
  }

  learnedOf(flowId: string): { versions: number; candidateId: string; revision?: number | undefined; digest?: string | undefined } | undefined {
    return this.learnedOn.get(flowId);
  }

  judged(flowId: string, judgeDigest: string): void {
    this.judgedOn.set(flowId, judgeDigest);
  }

  judgedWith(flowId: string): string | undefined {
    return this.judgedOn.get(flowId);
  }

  pin(flowId: string, flowVersion: number, at: number): void {
    this.pinnedOn.set(flowId, { flowVersion, at });
  }

  pinnedOf(flowId: string): { flowVersion: number; at: number } | undefined {
    return this.pinnedOn.get(flowId);
  }

  list(query: FluxNodeListRunsQuery): FluxNodeListRunsResponse {
    const matching = this.newestFirst.map((runId) => this.runs.get(runId)!.run).filter((run) => {
      const summary = run.summary();
      return (query.name === undefined || summary.name === query.name) && (query.state === undefined || summary.state === query.state) && (query.correlationId === undefined || summary.correlationId === query.correlationId);
    });
    const at = query.cursor === undefined ? -1 : matching.findIndex((run) => run.runId === query.cursor);
    // A cursor this Core did not give, or whose run no longer matches, ends the listing rather than starting it again.
    if (query.cursor !== undefined && at < 0) return { runs: [] };
    const from = at + 1;
    const page = matching.slice(from, from + query.limit);
    const more = from + page.length < matching.length;
    return { runs: page.map((run) => run.summary()), ...(more && page.length ? { nextCursor: page[page.length - 1]!.runId } : {}) };
  }
}

function digestOf(request: unknown): string {
  return canonicalJson(JSON.parse(JSON.stringify(request ?? null)) as JsonValue);
}
