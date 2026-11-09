// One run inside the fake engine: its events, the answers waiting for it, and how it ends.

import type { JsonObject, JsonValue } from "@fluxiq/contracts/core";
import { fluxNodeNameToFlowPath, parseFluxNodeRunResult, type FluxNodeEventAnswer, type FluxNodeRunEvent, type FluxNodeRunResult } from "@fluxiq/contracts/fluxnode";

type EventBody = FluxNodeRunEvent extends infer E ? (E extends unknown ? Omit<E, "runId" | "seq" | "at"> : never) : never;

export type Ending = { status: "achieved" | "budget_out" | "stopped" | "waiting_for_person"; outputs?: JsonValue; waitingFor?: string; verdictBy?: "type" | "check" | "judge" };

export class FakeRun {
  readonly id: string;
  readonly name: string;
  readonly inputs: JsonObject;
  readonly events: FluxNodeRunEvent[] = [];
  readonly answers = new Map<string, FluxNodeEventAnswer>();
  result: FluxNodeRunResult | undefined;
  stopRequested = false;
  readonly #listeners = new Set<() => void>();
  readonly #waiters = new Map<string, (answer: FluxNodeEventAnswer) => void>();

  constructor(id: string, name: string, inputs: JsonObject) {
    this.id = id;
    this.name = name;
    this.inputs = inputs;
  }

  emit(body: EventBody): FluxNodeRunEvent {
    const event = { ...body, runId: this.id, seq: this.events.length + 1, at: Date.now() } as FluxNodeRunEvent;
    this.events.push(event);
    for (const listener of this.#listeners) listener();
    return event;
  }

  /** Waits up to `ms` for the program's answer to `eventId`; `undefined` when none comes. */
  awaitAnswer(eventId: string, ms: number): Promise<FluxNodeEventAnswer | undefined> {
    const given = this.answers.get(eventId);
    if (given !== undefined) return Promise.resolve(given);
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.#waiters.delete(eventId);
        resolve(undefined);
      }, ms);
      this.#waiters.set(eventId, (answer) => {
        clearTimeout(timer);
        resolve(answer);
      });
    });
  }

  answer(answer: FluxNodeEventAnswer): void {
    this.answers.set(answer.eventId, answer);
    this.#waiters.get(answer.eventId)?.(answer);
    this.#waiters.delete(answer.eventId);
  }

  /** Calls `listener` whenever an event is added. Returns the way to stop. */
  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  end(ending: Ending): void {
    const resumable = ending.status === "budget_out" || ending.status === "waiting_for_person";
    const candidate = {
      runId: this.id,
      name: this.name,
      flowId: "flow_1",
      flowPath: fluxNodeNameToFlowPath(this.name),
      status: ending.status,
      ...(ending.outputs === undefined ? {} : { outputs: ending.outputs }),
      verdict: ending.status === "achieved" ? { label: "confirmed", by: ending.verdictBy ?? "type" } : { label: "unverified" },
      path: "explored",
      cost: { calls: 3, tokens: 1200, usd: 0.0123 },
      timings: { startedAt: this.events[0]?.at ?? Date.now(), endedAt: Date.now(), durationMs: 10 },
      ...(resumable ? { resumeHandle: `resume-${this.id}-handle` } : {}),
      ...(ending.waitingFor === undefined ? {} : { waitingFor: ending.waitingFor })
    };
    const parsed = parseFluxNodeRunResult(candidate);
    if (!parsed.ok) throw new Error(`The fake engine built an invalid result: ${JSON.stringify(parsed.issues)}`);
    this.result = parsed.value;
    this.emit({ type: "ended", result: parsed.value });
  }
}
