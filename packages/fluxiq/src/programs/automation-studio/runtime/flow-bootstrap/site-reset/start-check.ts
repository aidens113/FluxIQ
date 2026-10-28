// Where the target stands against where the build began (t462).
//
// The start is read once, through the bound domain's `startState`, right after
// the loop's opening call took the target to the build's start (`initial.*`),
// or before the first later call when there was no such call: before anything
// this build does can have changed it. It is asked once, and only once; a
// start that could not be read is not read later, when acts may already be on
// the site.
//
// Before a trial that follows a lasting act, `compare` takes the target back
// to the start through the run-node tool's own arrival, run by the loop's inner
// executor as any call is, and asks `startState` again with the start it kept.
// Its `differs` is what is not as it was, in the domain's words. When there is
// no start, no arrival or no `startState`, or any of it fails, `differs` is
// absent and the ledger alone decides (`./trial-policy.ts`). Core reads no
// state here: `state` stays opaque, kept only to hand back.
//
// **Each act's own page (t471).** The start page alone vouched for every act:
// lane D round 9 (`run-mv5q4j2n-25784472`) began on a home page that showed
// nothing of the requests its trial confirmed, so a dirty site read as clean.
// `read` reads the target where it stands, without moving it, so the candidate
// loop can keep the state of an act's page just before the act and what the
// act changed there; `compareAt` takes the target back to that page -- the
// arrival's own node, with the `location` the domain answered in place of the
// start -- and says what differs from the state before the act.
//
// **What changes by itself is not an act's (t475).** Lane B round 10
// (`run-mv5tusj4-b7ee0630`) was asked to undo a home page's rotating carousel
// as an act's effect, and those asks drove removals of what the build never
// added. With `liveCheck`, every read the reset decides on is a settled read
// (`settled`): the page is read twice, `settleMs` apart, with nothing done
// between, and a line or difference the first read had and the second no
// longer has went away by itself: live content. It is remembered, and left
// out of every read and comparison from then on. Only what went away counts:
// an act's effect that is slow to appear shows only in the second read, and
// is never taken for live content and hidden. Core compares the domain's strings only for equality, so this
// holds for any domain and names no site; the domain itself leaves out what it
// already knows is not state, such as focus.
//
// **Items (t475).** A read may carry the opaque tokens of the items on the
// page (`items`), in the form a declaration's `control.item` takes. Every
// token any read has seen is remembered (`seenItems`): an act created an item
// only if no read of this build saw it before (`./act-places.ts`).
//
// **Every move is counted (t738).** Core's own looks move the tab: the ledger
// looks at each stale witness's place itself before it refuses a trial
// (`lookAt`), and a refusal's `moved` never said so. Office rerun round 2
// (`run-mvgf04kw-310fc169`, 0126-0131 and 0159-0161): two tests were refused
// `candidate.trial_reset_required` with no effect applied, yet the tab had
// left the checkout page for a product page and then the basket, and the
// model's next calls ran on a page it had not seen. `moves` counts every
// arrival this check ran that applied an effect -- `compare`, `compareAt` and
// `lookAt` alike -- so a caller that reads it before and after a reset check
// knows whether the tab stands where the model last saw it.
//
// **Each arrival is Core's own move (t743).** Office rerun round 4
// (`run-mvgvyaip-d856e135`, 0090-0127): Core's look at a stale list's place went
// through the web domain's rule for the model's calls -- an address the brief
// was never shown is refused -- and was refused unrun, so the list stayed unread
// and its act open. `compare`, `compareAt` and `lookAt` run their arrival inside
// `runAsAutomationStudioCoreMove`, and the registry frames it `move: "core"`
// (`../../llm/harness-options/core-move.ts`), so a domain holds it to none of the
// model's rules. Only the arrival: the reads around it never go through a call.

import type { JsonObject } from "../../../../../core/index.ts";
import { automationStudioActionPermissionDenied } from "../../action-permissions/index.ts";
import { AUTOMATION_STUDIO_LLM_RUN_NODE_TOOL_ID, runAsAutomationStudioCoreMove, type AutomationStudioLlmEvidenceRuntimeBinding, type AutomationStudioLlmEvidenceTool } from "../../llm/index.ts";
import { automationStudioSiteResetValuesOf as valuesOf } from "../reset-settlement/index.ts";
import type { AutomationStudioSiteResetComparison, AutomationStudioSiteResetLines, AutomationStudioSiteResetPlace, AutomationStudioSiteResetRead, AutomationStudioSiteResetReadAnswer } from "./contracts.ts";

type Execute = (call: { callId: string; toolId: string; value: JsonObject; signal?: AbortSignal }) => Promise<unknown>;

/** A settled read: the page read twice this far apart, and what differed between the two taken as live content (header). */
export type AutomationStudioSiteResetLiveCheck = { settleMs: number; sleep?: ((ms: number, signal?: AbortSignal) => Promise<void>) | undefined };

export class AutomationStudioSiteResetStartCheck {
  private attempted = false;
  private start: JsonObject | undefined;
  private checks = 0;
  private reads = 0;
  private places = 0;
  /** Why the last read or comparison could not be made, kept for a reader rather than dropped. */
  private lastFailure: unknown;
  /** Differences and lines seen to change between two reads with nothing done between: live content (header). */
  private readonly liveDiffers = new Set<string>();
  private readonly liveLines = new Set<string>();
  /** Every item token a read has seen. */
  private readonly seen = new Set<string>();
  /** Arrivals this check ran that applied an effect (header, t738). */
  private moved = 0;

  constructor(private readonly input: {
    binding: Pick<AutomationStudioLlmEvidenceRuntimeBinding, "startState" | "runsNodes"> | undefined;
    projectId: string;
    flowId: string;
    tools: readonly AutomationStudioLlmEvidenceTool[];
    executeTool: Execute;
    /** Absent: every read is taken once, as it comes. */
    liveCheck?: AutomationStudioSiteResetLiveCheck | undefined;
  }) {}

  /** Whether the start was read. */
  get taken(): boolean { return this.start !== undefined; }

  /** Why the last read or comparison failed, if one did. */
  get failure(): unknown { return this.lastFailure; }

  /** How many times this check has moved the target so far (header, t738): compare it before and after a check. */
  get moves(): number { return this.moved; }

  /** The item tokens every read so far has seen. */
  seenItems(): ReadonlySet<string> {
    return new Set(this.seen);
  }

  /** Reads the start, the first time only. */
  async capture(signal?: AbortSignal): Promise<void> {
    if (this.attempted) return;
    this.attempted = true;
    const startState = this.input.binding?.startState;
    if (!startState) return;
    try {
      const read = await startState.call(this.input.binding, { projectId: this.input.projectId, flowId: this.input.flowId, callId: "site-reset.start", permission: automationStudioActionPermissionDenied, ...(signal ? { signal } : {}) });
      if (stateAnswer(read)) {
        this.start = structuredClone(read.state);
        for (const item of stringsOf(read.items) ?? []) this.seen.add(item);
      }
    } catch (error) {
      if (signal?.aborted) throw error;
      this.lastFailure = error;
    }
  }

  /** Reads the target where it stands, against `start` when given, or says why it could not. Never moves it. */
  async read(start?: JsonObject, signal?: AbortSignal): Promise<AutomationStudioSiteResetReadAnswer> {
    const startState = this.input.binding?.startState;
    if (!startState) return { unread: "no_reader" };
    this.reads += 1;
    try {
      const read = await startState.call(this.input.binding, { projectId: this.input.projectId, flowId: this.input.flowId, callId: `site-reset.read.${this.reads}`, ...(start ? { start: structuredClone(start) } : {}), permission: automationStudioActionPermissionDenied, ...(signal ? { signal } : {}) });
      if (!stateAnswer(read)) return { unread: "no_answer" };
      const lines = linesOf(read.lines);
      const items = stringsOf(read.items);
      const subjects = stringsOf(read.subjects);
      for (const item of items ?? []) this.seen.add(item);
      return this.steady({ state: structuredClone(read.state), differs: [...read.differs], ...(typeof read.location === "string" && read.location ? { location: read.location } : {}), ...(lines ? { lines } : {}), ...(items ? { items: [...new Set(items)] } : {}), ...(subjects ? { subjects: [...new Set(subjects)] } : {}), ...(typeof read.scope === "string" ? { scope: read.scope } : {}), ...(typeof read.resource === "string" && /^[A-Za-z0-9:_-]{1,128}$/u.test(read.resource) ? { resource: read.resource } : {}), ...(collectionsOf(read.collections) ? { collections: collectionsOf(read.collections)! } : {}), ...(controlsOf(read.controls) ? { controls: controlsOf(read.controls)! } : {}), ...(valuesOf(read.values) ? { values: valuesOf(read.values)! } : {}) });
    } catch (error) {
      if (signal?.aborted) throw error;
      this.lastFailure = error;
      return { unread: "failed" };
    }
  }

  /**
   * A read the reset decides on (header): with `liveCheck`, read twice with
   * nothing done between, what differed between the two remembered as live,
   * and the second read answered without it. Without it, one read.
   */
  async settled(start?: JsonObject, signal?: AbortSignal): Promise<AutomationStudioSiteResetReadAnswer> {
    const first = await this.read(start, signal);
    const live = this.input.liveCheck;
    if (!live || "unread" in first) return first;
    await (live.sleep ?? pause)(live.settleMs, signal);
    const again = await this.read(start, signal);
    if ("unread" in again) return first;
    // The same page only when both reads named it: two unknown locations are not one page (t479).
    if (first.location !== undefined && first.location === again.location) {
      for (const entry of vanished(first.differs, again.differs)) this.liveDiffers.add(entry);
      for (const line of [...vanished(first.lines?.added ?? [], again.lines?.added ?? []), ...vanished(first.lines?.gone ?? [], again.lines?.gone ?? [])]) this.liveLines.add(line);
    }
    return this.steady(again);
  }

  /** Takes the target to the page an act was made on and says what differs from it before the act; `differs` is absent when that cannot be said. */
  async compareAt(place: AutomationStudioSiteResetPlace, signal?: AbortSignal): Promise<AutomationStudioSiteResetComparison> {
    const tool = this.input.tools.find((entry) => entry.toolId === AUTOMATION_STUDIO_LLM_RUN_NODE_TOOL_ID);
    const to = this.input.binding?.runsNodes?.arrival;
    if (!this.input.binding?.startState || !tool || !to || !to.parameter || !place.location) return { moved: false };
    this.places += 1;
    const n = this.places;
    let moved = false;
    try {
      // The arrival's own node, as `../../llm/node-tools/run-node.ts` writes the build's start into it: nothing lasting.
      const ran = await this.arrive({ callId: `site-reset.place.${n}.arrival`, toolId: tool.toolId, value: { node: to.node, parameters: { [to.parameter]: place.location }, consequences: [] }, ...(signal ? { signal } : {}) });
      moved = this.arrived(ran);
      if (!landed(ran)) return { moved };
      const read = await this.settled(place.state, signal);
      return "unread" in read ? { moved } : { moved, differs: read.differs, ...(read.lines ? { lines: read.lines } : {}) };
    } catch (error) {
      if (signal?.aborted) throw error;
      this.lastFailure = error;
      return { moved };
    }
  }

  /**
   * Takes the target to `location` and reads it there, settled (L1): Core
   * looks at an open act's watched place itself before asking the model. The
   * caller hands the read to the ledgers; an unread answer says why not.
   */
  async lookAt(location: string, signal?: AbortSignal): Promise<AutomationStudioSiteResetReadAnswer> {
    const tool = this.input.tools.find((entry) => entry.toolId === AUTOMATION_STUDIO_LLM_RUN_NODE_TOOL_ID);
    const to = this.input.binding?.runsNodes?.arrival;
    if (!this.input.binding?.startState) return { unread: "no_reader" };
    if (!tool || !to || !to.parameter || !location) return { unread: "no_answer" };
    this.places += 1;
    const n = this.places;
    try {
      // The arrival's own node, as `compareAt` goes to an act's page: nothing lasting.
      const ran = await this.arrive({ callId: `site-reset.look.${n}.arrival`, toolId: tool.toolId, value: { node: to.node, parameters: { [to.parameter]: location }, consequences: [] }, ...(signal ? { signal } : {}) });
      this.arrived(ran);
      if (!landed(ran)) return { unread: "no_answer" };
      return await this.settled(undefined, signal);
    } catch (error) {
      if (signal?.aborted) throw error;
      this.lastFailure = error;
      return { unread: "failed" };
    }
  }

  /** Takes the target back to the start and says what still differs; `differs` is absent when that cannot be said. */
  async compare(signal?: AbortSignal): Promise<AutomationStudioSiteResetComparison> {
    const startState = this.input.binding?.startState;
    const tool = this.input.tools.find((entry) => entry.toolId === AUTOMATION_STUDIO_LLM_RUN_NODE_TOOL_ID);
    const arrival = tool?.initialObservation?.arrival;
    const start = this.start;
    if (!startState || !start || !tool || !arrival) return { moved: false };
    this.checks += 1;
    const n = this.checks;
    let moved = false;
    try {
      const ran = await this.arrive({ callId: `site-reset.${n}.arrival`, toolId: tool.toolId, value: structuredClone(arrival), ...(signal ? { signal } : {}) });
      moved = this.arrived(ran);
      if (!landed(ran)) return { moved };
      const ask = async (callId: string): Promise<string[] | undefined> => {
        const read = await startState.call(this.input.binding, { projectId: this.input.projectId, flowId: this.input.flowId, callId, start: structuredClone(start), permission: automationStudioActionPermissionDenied, ...(signal ? { signal } : {}) });
        if (!stateAnswer(read)) return undefined;
        for (const item of stringsOf(read.items) ?? []) this.seen.add(item);
        return [...read.differs];
      };
      const first = await ask(`site-reset.${n}.start`);
      if (first === undefined) return { moved };
      const live = this.input.liveCheck;
      if (!live) return { moved, differs: this.steadyDiffers(first) };
      // Read again with nothing done between: what changed by itself is live content, not the build's (header).
      await (live.sleep ?? pause)(live.settleMs, signal);
      const again = await ask(`site-reset.${n}.start.again`);
      if (again === undefined) return { moved, differs: this.steadyDiffers(first) };
      for (const entry of vanished(first, again)) this.liveDiffers.add(entry);
      return { moved, differs: this.steadyDiffers(again) };
    } catch (error) {
      if (signal?.aborted) throw error;
      this.lastFailure = error;
      return { moved };
    }
  }

  /** Runs one of Core's own arrivals as Core's move (header, t743). */
  private arrive(call: Parameters<Execute>[0]): Promise<unknown> {
    return runAsAutomationStudioCoreMove(() => this.input.executeTool(call));
  }

  /** Whether an arrival applied an effect, counted when it did (header, t738). */
  private arrived(ran: unknown): boolean {
    const moved = isExecution(ran) && ran.effectApplied === true;
    if (moved) this.moved += 1;
    return moved;
  }

  /** A read with what is known to be live left out of its differences and lines. */
  private steady(read: AutomationStudioSiteResetRead): AutomationStudioSiteResetRead {
    if (!this.liveDiffers.size && !this.liveLines.size) return read;
    const lines = read.lines ? { gone: read.lines.gone.filter((line) => !this.liveLines.has(line)), added: read.lines.added.filter((line) => !this.liveLines.has(line)) } : undefined;
    return { ...read, differs: this.steadyDiffers(read.differs), ...(lines ? { lines } : {}) };
  }

  private steadyDiffers(differs: readonly string[]): string[] {
    return differs.filter((entry) => !this.liveDiffers.has(entry));
  }
}

type Execution = { kind: "llm_evidence_tool_execution"; effectApplied?: unknown; evidence?: unknown };

function isExecution(value: unknown): value is Execution {
  return isObject(value) && value.kind === "llm_evidence_tool_execution";
}

/** The arrival ran and did not answer `ok: false`. */
function landed(value: unknown): boolean {
  if (!isExecution(value)) return false;
  return !(isObject(value.evidence) && value.evidence.ok === false);
}

/** The domain's lines, when it gave them in the agreed shape. */
function linesOf(value: unknown): AutomationStudioSiteResetLines | undefined {
  if (!isObject(value) || !strings(value.gone) || !strings(value.added)) return undefined;
  return { gone: [...value.gone], added: [...value.added] };
}

function strings(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

/** The domain's item tokens, when it gave them as strings. */
function stringsOf(value: unknown): string[] | undefined {
  return strings(value) ? [...value] : undefined;
}

/** The entries the first read had that the second no longer has, counting repeats: what went away by itself. */
function vanished(first: readonly string[], again: readonly string[]): string[] {
  const available = new Map<string, number>();
  for (const entry of again) available.set(entry, (available.get(entry) ?? 0) + 1);
  return first.filter((entry) => {
    const count = available.get(entry) ?? 0;
    if (count === 0) return true;
    available.set(entry, count - 1);
    return false;
  });
}

/** Waits `ms`, or rejects when `signal` aborts. */
function pause(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const stop = (): void => {
      clearTimeout(timer);
      reject(signal?.reason);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", stop);
      resolve();
    }, ms);
    signal?.addEventListener("abort", stop, { once: true });
  });
}

function stateAnswer(value: unknown): value is { state: JsonObject; differs: string[]; location?: unknown; lines?: unknown; items?: unknown } {
  return isObject(value) && isObject(value.state) && Array.isArray(value.differs) && value.differs.every((entry) => typeof entry === "string");
}

function isObject(value: unknown): value is Record<string, unknown> & JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The domain's control places and state counts, when every token and count is well formed (L1); otherwise none. */
function controlsOf(value: unknown): Record<string, Record<string, number>> | undefined {
  if (!isObject(value)) return undefined;
  const token = (entry: string): boolean => /^[A-Za-z0-9:_-]{1,128}$/u.test(entry);
  const places = Object.entries(value);
  if (places.length > 2_000) return undefined;
  const controls: Record<string, Record<string, number>> = {};
  for (const [place, states] of places) {
    if (!token(place) || !isObject(states)) return undefined;
    const counts: Record<string, number> = {};
    for (const [state, count] of Object.entries(states)) {
      if (!token(state) || typeof count !== "number" || !Number.isSafeInteger(count) || count < 1) return undefined;
      counts[state] = count;
    }
    controls[place] = counts;
  }
  return controls;
}

/** Only a fully shaped opaque inventory can witness a collection's absence. */
function collectionsOf(value: unknown): Array<{ scope: string; group: string; subjects: string[]; states: Record<string, string> }> | undefined {
  if (!Array.isArray(value) || value.length > 2_000) return undefined;
  const token = (entry: unknown): entry is string => typeof entry === "string" && /^[A-Za-z0-9:_-]{1,128}$/u.test(entry);
  if (!value.every((entry) => isObject(entry) && token(entry.scope) && token(entry.group) && Array.isArray(entry.subjects) && entry.subjects.length <= 2_000 && entry.subjects.every(token) && isObject(entry.states) && Object.keys(entry.states).length === entry.subjects.length && entry.subjects.every((subject) => Object.hasOwn(entry.states as object, subject) && token((entry.states as Record<string, unknown>)[subject])))) return undefined;
  return value.map((entry) => ({ scope: entry.scope as string, group: entry.group as string, subjects: [...entry.subjects as string[]], states: { ...entry.states as Record<string, string> } }));
}
