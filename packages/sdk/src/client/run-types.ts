// What a program passes to a run and what it gets back.

import type { JsonObject } from "@fluxiq/contracts/core";
import type { FluxNodeOptions, FluxNodeRunEvent, FluxNodeRunResult } from "@fluxiq/contracts/fluxnode";
import type { FluxNodeOverridesInput } from "../define/index.ts";

/** The `person_needed` event: only a person can go on. */
export type PersonNeeded = Extract<FluxNodeRunEvent, { type: "person_needed" }>;

/** How a program answers a person-only moment: the person did it, or will not. */
export type PersonAnswer = "done" | "declined" | { outcome: "done" | "declined"; note?: string };

/** A transform the program registered under a callback name (plan, D2). */
export type TransformFunction = (records: JsonObject[]) => JsonObject[] | Promise<JsonObject[]>;

/**
 * - `signal`: aborting it stops the run, which then ends `stopped` with what it has;
 * - `overrides`: this run's options (`retries`, `judge`, `budgetUsd`, `model`, `mode`, `timeoutMs`; `retries` stays at least 3)
 *   and FluxNode overrides (`prompts`, `judgeCriteria`, `tools`, `models`, `deadlines`, `retryWaits`, `pace`), each replacing
 *   the declared one. The SDK sends the first group as `options`, the second as `overrides`. Not offered on a resume;
 * - `onPersonNeeded`: answers a person-only moment; without it the run ends `waiting_for_person`
 *   with a resume handle;
 * - `onEvent`: sees every event, for progress;
 * - `transforms`: the SDK transforms the engine may ask for, by callback name;
 * - `correlationId`, `idempotencyKey`: passed through (plan, D3).
 */
export type RunOptions = {
  signal?: AbortSignal;
  overrides?: FluxNodeOptions & FluxNodeOverridesInput;
  onPersonNeeded?: (event: PersonNeeded) => PersonAnswer | Promise<PersonAnswer>;
  onEvent?: (event: FluxNodeRunEvent) => void;
  transforms?: Record<string, TransformFunction>;
  correlationId?: string;
  idempotencyKey?: string;
};

/** A run whose outputs passed: `outputs` is typed by the node's zod outputs. */
export type AchievedRun<O> = Omit<FluxNodeRunResult, "status" | "outputs"> & { status: "achieved"; outputs: O };

/**
 * A run that ended without passing: its budget is gone (`budget_out`), the program
 * stopped it (`stopped`), or a person must act (`waiting_for_person`). `outputs` is
 * the best partial result, if any; `resumeHandle` continues the first and last.
 */
export type UnfinishedRun = Omit<FluxNodeRunResult, "status"> & { status: "budget_out" | "stopped" | "waiting_for_person" };

/** Every way a run ends. Narrow on `status` to get typed `outputs`. */
export type RunOutcome<O> = AchievedRun<O> | UnfinishedRun;
