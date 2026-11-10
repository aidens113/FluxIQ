import { AsyncLocalStorage } from "node:async_hooks";

/**
 * One timed part of a tool step, as `meta.json` writes it: a name from the
 * caller's own closed vocabulary (`look.before`, `send.click`, `page.click`),
 * where it began as milliseconds after the step began (`at`), how long it took
 * (`ms`), and at most one short closed word about it (`detail`). Never page text.
 */
export type AutomationStudioLlmStepLogSpan = { name: string; at: number; ms: number; detail?: string };

/** A span as a caller records it: absolute epoch milliseconds, from the clock the step itself is timed with. */
type RecordedSpan = { name: string; startedAt: number; finishedAt: number; detail?: string };

/** The longest span name and detail kept: they are labels, and a longer string is not one. */
const LABEL_MAX = 64;
/** At most this many spans per step, so a loop that records on every pass cannot grow `meta.json` without bound. */
const SPANS_MAX = 200;

/**
 * One store per process, whatever copy of this module a caller loaded. The web
 * server bundles its own copies of Core, while a domain's host module imports
 * Core's compiled `fluxiq/automation`: a store per copy meant the domain
 * recorded into a store no tool step had opened, and no span was ever written
 * (the first Lab run, 2026-11-10). The key is registered, so every copy finds
 * the same store.
 */
const STORE_KEY = Symbol.for("fluxiq.runtime.llm.step-log.spans");
const storage: AsyncLocalStorage<RecordedSpan[]> = ((globalThis as Record<symbol, unknown>)[STORE_KEY] ??= new AsyncLocalStorage<RecordedSpan[]>()) as AsyncLocalStorage<RecordedSpan[]>;

/**
 * Where a tool step's time went (task speed S0): what the step's own work
 * says it spent, inside the step's start and end, written to its `meta.json`
 * as `spans`.
 *
 * The tool step opens a collector around the call (`collect`), and the
 * domain that runs the call records into whichever collector is current
 * (`record`). Outside a step -- the step log off, or work no tool step
 * wraps -- `record` does nothing, so a caller times its work unconditionally
 * and never asks whether anyone is listening. Best-effort like every step-log
 * write: a span that cannot be kept never changes or fails the call.
 */
export const automationStudioLlmStepLogSpans = {
  /** `fn` with a fresh collector current, and the spans recorded inside it. */
  collect<T>(fn: () => Promise<T>): { done: Promise<T>; spans: () => RecordedSpan[] } {
    const spans: RecordedSpan[] = [];
    // Async, so a `fn` that throws before its first await rejects `done` rather than throwing here.
    return { done: storage.run(spans, async () => await fn()), spans: () => spans };
  },
  /** Whether a step is collecting now: a step opened inside another's work would take the spans that one is owed. */
  active(): boolean {
    return storage.getStore() !== undefined;
  },
  /** One timed part of the current step; nothing outside a step, and nothing for a span that is not one. */
  record(name: string, startedAt: number, finishedAt: number, detail?: string): void {
    const spans = storage.getStore();
    if (!spans || spans.length >= SPANS_MAX) return;
    if (typeof name !== "string" || name === "" || !Number.isFinite(startedAt) || !Number.isFinite(finishedAt) || finishedAt < startedAt) return;
    spans.push({ name: name.slice(0, LABEL_MAX), startedAt, finishedAt, ...(typeof detail === "string" && detail !== "" ? { detail: detail.slice(0, LABEL_MAX) } : {}) });
  },
  /** `work`, timed as one span of the current step, whether it resolves or throws. */
  async time<T>(name: string, work: () => Promise<T>, detail?: string): Promise<T> {
    const startedAt = Date.now();
    try {
      return await work();
    } finally {
      automationStudioLlmStepLogSpans.record(name, startedAt, Date.now(), detail);
    }
  },
  /** The spans as `meta.json` writes them, relative to the step's own start and in the order they began. */
  written(spans: readonly RecordedSpan[], stepStartedAt: number): AutomationStudioLlmStepLogSpan[] {
    return [...spans]
      .sort((left, right) => left.startedAt - right.startedAt)
      .map((span) => ({ name: span.name, at: span.startedAt - stepStartedAt, ms: span.finishedAt - span.startedAt, ...(span.detail !== undefined ? { detail: span.detail } : {}) }));
  }
};
