// One node run outside a graph run, under the same retry policy a graph run
// gives every node.
//
// **Why it exists (t355, the user's rule of 2026-10-07).** Every node retries a
// transient failure automatically, on every path: "a step must never fail on
// one too-early attempt or just give up". A saved Flow's playback and a
// candidate trial run nodes through `graph-run.ts`, which has always had an
// attempt loop. But a build also runs single nodes against the live page with
// no graph around them -- each call it makes while exploring, and each step its
// own test runs replay -- and a domain sent those once and handed the first
// answer to the model. Lane A round 4 (`run-muyrpbnk-fef374e7`) is the case: a
// press the page refused as "Network busy, please try again" came back to the
// model as a refusal with nothing tried again, while the same press in a saved
// Flow would have been made again after a wait.
//
// **Nothing here is a second policy.** The number of attempts and the waits are
// `AUTOMATION_STUDIO_DEFAULT_NODE_RETRY_POLICY`; whether a fault may be tried
// again is `automationStudioAssessAttemptFault`, the very question the graph
// executor asks, with the act-twice gates in it; and each wait is
// `automationStudioBoundedRetryWaitMs`, so a page's own "try again in N
// seconds" is honoured and bounded the same way. A caller supplies only how to
// dispatch the node and how to read its answer as a failure record.
//
// **A lasting act is checked, never blindly repeated.** The caller says what
// the node is (`node`), and the assessment refuses a retry of a mutating node
// whose fault was found after it acted or whose effect is unknown. A fault the
// producer proved never reached the page (`effect: "unacted"`: a target not
// found yet, a press the page turned away as too fast) is repeated, because
// nothing happened to repeat.

import type { AutomationStudioFailureRecord } from "@fluxiq/contracts/automation-studio";
import type { AutomationStudioFlowNode } from "../../../model/index.ts";
import type { AutomationStudioNodeAttemptTrace } from "../contracts.ts";
import { automationStudioAssessAttemptFault, automationStudioBoundedRetryWaitMs, automationStudioFaultNotLanded, automationStudioRunEffectCheck, type AutomationStudioFaultAssessment, type AutomationStudioLastingActCheck } from "../defensive/index.ts";
import { AUTOMATION_STUDIO_DEFAULT_NODE_RETRY_POLICY, automationStudioRetryBackoffMs } from "../retry-policy.ts";

/** What one attempt answered: success, or a failure with the producer's record when it gave one. */
export type AutomationStudioNodeRetryReading = { ok: true } | { ok: false; failure?: AutomationStudioFailureRecord };

/** The node run with its retries, and the account of what the retries absorbed. */
export type AutomationStudioNodeRetryOutcome<T> = {
  /** The last attempt's own answer, never one synthesized here. */
  result: T;
  /** How many times the node was dispatched, the first attempt included. */
  attempts: number;
  /** The wall clock spent waiting between attempts. */
  waitedMs: number;
  /** Each failed attempt's assessment, in order: retried ones, then the one that ended it, if any. */
  faults: AutomationStudioFaultAssessment[];
  /**
   * How a lasting act that failed with its effect unknown was settled (t359):
   * `landed` when the caller's effect check showed it took effect, so the node
   * counts as done although the last answer is a failure; `uncertain` when
   * nothing showed whether it did, so it was not made again. Absent otherwise.
   */
  lastingAct?: "landed" | "uncertain";
};

/**
 * The effect check, the one hook a graph run uses too (C8): defined with the
 * rest of the defensive policy (`../defensive/effect-check.ts`) and named here
 * as well, where callers outside a graph first met it.
 */
export type { AutomationStudioLastingActCheck };

/**
 * Dispatches a node, and dispatches it again after each fault the default
 * policy absorbs, up to the default's attempts. The answer is the last
 * attempt's, with how many there were.
 *
 * A failure without a record is not guessed at: it is the answer. An abort
 * between attempts ends the loop with the answer in hand, so a cancelled build
 * never dispatches again.
 */
export async function automationStudioDispatchWithNodeRetries<T>(input: {
  /** Runs one attempt; `attempt` is 1 for the first. */
  dispatch(attempt: number): Promise<T>;
  /** Reads one attempt's answer. */
  read(result: T): AutomationStudioNodeRetryReading;
  /**
   * The node as the act-twice gates read it: its definition, and Core's neutral
   * `metadata.effect` (`"mutate"` or `"observe"`) where the caller knows it.
   */
  node: AutomationStudioFlowNode;
  /**
   * Whether a lasting act whose failure left its effect unknown took effect
   * after all. Without one, such an act ends `uncertain` and is not made again.
   */
  checkEffect?: AutomationStudioLastingActCheck<T> | undefined;
  signal?: AbortSignal | undefined;
  /** How the loop waits; a real, unreferenced timer by default. */
  delay?: (ms: number, signal?: AbortSignal) => Promise<void>;
  now?: () => number;
}): Promise<AutomationStudioNodeRetryOutcome<T>> {
  const policy = AUTOMATION_STUDIO_DEFAULT_NODE_RETRY_POLICY;
  const now = input.now ?? Date.now;
  const delay = input.delay ?? unreferencedDelay;
  const faults: AutomationStudioFaultAssessment[] = [];
  let waitedMs = 0;
  for (let attempt = 1; ; attempt += 1) {
    const startedAt = now();
    const result = await input.dispatch(attempt);
    const reading = input.read(result);
    if (reading.ok || !reading.failure) return { result, attempts: attempt, waitedMs, faults };
    const assessed = automationStudioAssessAttemptFault(failedAttempt(input.node, attempt, startedAt, reading.failure), input.node, now());
    // A lasting act whose failure left its effect unknown is checked, never blindly repeated (t359).
    const settled = assessed?.actUncertain ? await automationStudioRunEffectCheck(input.checkEffect, result, attempt) : undefined;
    if (assessed && (settled === "landed" || settled === "unknown")) {
      faults.push(assessed);
      return { result, attempts: attempt, waitedMs, faults, lastingAct: settled === "landed" ? "landed" : "uncertain" };
    }
    const fault = assessed && settled === "not_landed" ? automationStudioFaultNotLanded(assessed) : assessed;
    if (fault) faults.push(fault);
    if (fault?.disposition !== "retry" || attempt >= policy.maxAttempts || input.signal?.aborted) return { result, attempts: attempt, waitedMs, faults };
    const wait = automationStudioBoundedRetryWaitMs({
      backoffMs: automationStudioRetryBackoffMs(policy, attempt + 1),
      ...(fault.hintedWaitMs === undefined ? {} : { hintedWaitMs: fault.hintedWaitMs }),
      nodeWaitedMs: waitedMs,
      runWaitedMs: waitedMs
    });
    if (wait.waitMs > 0) await delay(wait.waitMs, input.signal);
    waitedMs += wait.waitMs;
    if (input.signal?.aborted) return { result, attempts: attempt, waitedMs, faults };
  }
}

/** The attempt as the graph executor would have traced it, which is all the assessment reads. */
function failedAttempt(node: AutomationStudioFlowNode, attempt: number, startedAt: number, failure: AutomationStudioFailureRecord): AutomationStudioNodeAttemptTrace {
  return { attemptId: `${node.id}.attempt.${attempt}`, nodeId: node.id, definitionId: node.definitionId, startedAt, status: "failed", route: "failed", inputs: {}, outputs: {}, effects: [], failure };
}

function unreferencedDelay(ms: number): Promise<void> {
  return new Promise<void>((resolve) => {
    const timer: ReturnType<typeof setTimeout> = setTimeout(resolve, ms);
    (timer as { unref?: () => void }).unref?.();
  });
}
