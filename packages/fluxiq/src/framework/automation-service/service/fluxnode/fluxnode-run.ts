// One FluxNode run as the API sees it while it runs and after (fluxnode-plan N4-N9): the events it has
// told, numbered from 1 with `ended` last; the events that wait for the program's answer and the
// waits behind them; the program's Stop; and its result once it has one. Held in memory
// (`./run-registry.ts`): a run outlives the call that started it, not the process.
//
// **A wait never outlives the run.** Stopping, or ending, settles every open wait with no answer, so a
// check or a person's question nobody answered can only send the attempt round again or park it.
//
// **A secret input never leaves it** (`format: "secret"`, `./secrets/`): every event it tells and the result
// it keeps show `[withheld]` wherever a secret's value would have been, whatever said it.

import { fluxNodeAnswerFitsEvent, type FluxNodeCost, type FluxNodeOverrides, type FluxNodeEventAnswer, type FluxNodeOptions, type FluxNodeRunEvent, type FluxNodeRunResult, type FluxNodeRunStateBody, type FluxNodeRunSummary } from "@fluxiq/contracts/fluxnode";
import type { JsonObject } from "../../../../core/index.ts";
import type { FluxNodeServiceRefusal } from "./fluxnode-service.ts";
import { fluxNodeWithheldForProgram } from "./secrets/index.ts";

/** An event as a run tells it, before Core numbers and stamps it. */
export type FluxNodeRunEventBody = FluxNodeRunEvent extends infer Event ? Event extends FluxNodeRunEvent ? Omit<Event, "runId" | "seq" | "at"> : never : never;

/** What a run runs: the FluxNode at its spec, its Flow, and this run's inputs and settings. */
export type FluxNodeRunTarget = {
  name: string;
  specHash: string;
  projectId: string;
  flowId: string;
  flowPath: string;
};

/** What a resume continues with: everything of the request but how it was started. */
export type FluxNodeRunCarried = {
  inputs: JsonObject;
  options?: FluxNodeOptions | undefined;
  /** The request's own overrides; never given to a child run, and a resume keeps the first run's. */
  overrides?: FluxNodeOverrides | undefined;
  correlationId?: string | undefined;
};

type Wait = { event: FluxNodeRunEvent; settle: (answer: FluxNodeEventAnswer | undefined) => void; answered: boolean };

export class FluxNodeRun {
  readonly startedAt: number;
  private readonly told: FluxNodeRunEvent[] = [];
  private readonly listeners = new Set<() => void>();
  private readonly waits = new Map<string, Wait>();
  private readonly onStop: (() => void)[] = [];
  private stopped: { reason?: string | undefined } | undefined;
  private ended: FluxNodeRunResult | undefined;
  private spent: FluxNodeCost = { calls: 0, tokens: 0, usd: 0 };
  private eventIds = 0;
  /** The budget the run was given, once known, for its `cost` event. */
  budgetUsd: number | undefined;
  /** The digest of the run's resolved overrides, once known and only when it had any, for its result. */
  overridesDigest: string | undefined;

  /** `secrets`: the values of the run's secret inputs, withheld from every event and the result. */
  constructor(readonly runId: string, readonly target: FluxNodeRunTarget, readonly carried: FluxNodeRunCarried, readonly eventsPath: string, private readonly now: () => number, private secrets: readonly string[] = []) {
    this.startedAt = now();
  }

  /** More secret values to withhold from every event told and the result from now on: a pipeline's mapped calls bring theirs as they are made. */
  withhold(more: readonly string[]): void {
    const fresh = more.filter((text) => text !== "" && !this.secrets.includes(text));
    if (fresh.length) this.secrets = [...this.secrets, ...fresh];
  }

  get result(): FluxNodeRunResult | undefined {
    return this.ended;
  }

  get stopRequested(): boolean {
    return this.stopped !== undefined;
  }

  get stopReason(): string | undefined {
    return this.stopped?.reason;
  }

  /** Tells an event: numbered, stamped and kept, and every reader woken. Nothing after `ended`. */
  tell(body: FluxNodeRunEventBody): FluxNodeRunEvent | undefined {
    if (this.ended) return undefined;
    const event = fluxNodeWithheldForProgram({ ...body, runId: this.runId, seq: this.told.length + 1, at: this.now() } as FluxNodeRunEvent, this.secrets);
    this.told.push(event);
    for (const listener of [...this.listeners]) listener();
    return event;
  }

  /** A fresh id for an event that waits for an answer. */
  nextEventId(): string {
    this.eventIds += 1;
    return `${this.runId}.e${this.eventIds}`;
  }

  /**
   * Tells an event that waits, and waits for its answer: until `until` (epoch ms) when given, and
   * never past the run's Stop or end. No answer by then is `undefined`.
   */
  async waitFor(body: Extract<FluxNodeRunEventBody, { eventId: string }>, until?: number): Promise<FluxNodeEventAnswer | undefined> {
    if (this.stopped || this.ended) return undefined;
    const event = this.tell(body);
    if (!event) return undefined;
    return await new Promise<FluxNodeEventAnswer | undefined>((resolve) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const settle = (answer: FluxNodeEventAnswer | undefined): void => {
        if (timer !== undefined) clearTimeout(timer);
        this.waits.delete(body.eventId);
        resolve(answer);
      };
      this.waits.set(body.eventId, { event, settle, answered: false });
      if (until !== undefined) timer = setTimeout(() => settle(undefined), Math.max(0, until - this.now()));
    });
  }

  /** The program's answer to a waiting event, or why it is refused. */
  answer(answer: FluxNodeEventAnswer): FluxNodeServiceRefusal | undefined {
    if (this.ended) return { code: "run_ended", message: "This run has ended, so nothing in it waits for an answer." };
    const wait = this.waits.get(answer.eventId);
    if (!wait) {
      const told = this.told.find((event) => "eventId" in event && event.eventId === answer.eventId);
      return told ? { code: "event_already_answered", message: "That event was already answered, or stopped waiting." } : { code: "unknown_event", message: "This run has no event with that id." };
    }
    if (!fluxNodeAnswerFitsEvent(wait.event, answer)) return { code: "answer_mismatch", message: `That event waits for a ${answerKindOf(wait.event)}.` };
    wait.answered = true;
    wait.settle(answer);
    return undefined;
  }

  /** The program's Stop: recorded once, every wait settled, and whoever stops the attempt told. */
  stop(reason?: string): void {
    if (this.stopped || this.ended) return;
    this.stopped = { reason };
    for (const wait of [...this.waits.values()]) wait.settle(undefined);
    for (const stopIt of this.onStop.splice(0)) stopIt();
  }

  /** Runs `stopIt` on the Stop, at once if it already came. */
  whenStopped(stopIt: () => void): void {
    if (this.stopped) stopIt();
    else this.onStop.push(stopIt);
  }

  /** The run's ending: its cost, then `ended`, the last event, and every wait settled. */
  end(given: FluxNodeRunResult): void {
    if (this.ended) return;
    const result = fluxNodeWithheldForProgram(given, this.secrets);
    this.spent = result.cost;
    for (const wait of [...this.waits.values()]) wait.settle(undefined);
    this.tell({ type: "cost", cost: result.cost, budgetUsd: this.budgetUsd ?? 0 });
    this.tell({ type: "ended", result });
    this.ended = result;
    this.onStop.splice(0);
  }

  eventsAfter(seq: number): FluxNodeRunEvent[] {
    return this.told.slice(Math.max(0, seq));
  }

  /** Called on every new event; the answer removes it. */
  listen(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  state(): FluxNodeRunStateBody {
    const waiting = [...this.waits.keys()];
    return {
      runId: this.runId, name: this.target.name, specHash: this.target.specHash, state: this.ended?.status ?? "running", startedAt: this.startedAt,
      eventsPath: this.eventsPath, cost: { ...this.spent },
      ...(waiting.length ? { waitingEventIds: waiting.slice(0, 64) } : {}),
      ...(this.carried.correlationId === undefined ? {} : { correlationId: this.carried.correlationId }),
      ...(this.ended ? { result: this.ended } : {})
    };
  }

  summary(): FluxNodeRunSummary {
    return {
      runId: this.runId, name: this.target.name, specHash: this.target.specHash, state: this.ended?.status ?? "running", startedAt: this.startedAt,
      ...(this.ended ? { endedAt: this.ended.timings.endedAt, path: this.ended.path } : {}), cost: { ...this.spent },
      ...(this.carried.correlationId === undefined ? {} : { correlationId: this.carried.correlationId })
    };
  }
}

function answerKindOf(event: FluxNodeRunEvent): string {
  if (event.type === "person_needed") return "person_answer";
  if (event.type === "check_needed") return "check_answer";
  return "transform_answer";
}
