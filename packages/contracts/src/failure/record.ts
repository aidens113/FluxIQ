import type { AutomationStudioAdaptiveFailureClass } from "./adaptive-class.ts";

/** Where in an action's life a failure happened. */
export const AUTOMATION_STUDIO_FAILURE_STAGES = Object.freeze([
  "target_resolution",
  "dispatch",
  "execution",
  "confirmation",
  "verification"
] as const);

export type AutomationStudioFailureStage = (typeof AUTOMATION_STUDIO_FAILURE_STAGES)[number];

/**
 * What a failure says about the act itself, when the producer can say.
 *
 * `unacted`: the producer states the act demonstrably did not happen -- the page
 * or service refused it and said so -- so making the same request again is not
 * a second act. `ambiguous`: it may have happened and only the answer is known
 * to be missing. A record without one says nothing, and Core reads its stage and
 * category instead.
 */
export const AUTOMATION_STUDIO_FAILURE_EFFECTS = Object.freeze(["unacted", "ambiguous"] as const);

export type AutomationStudioFailureEffect = (typeof AUTOMATION_STUDIO_FAILURE_EFFECTS)[number];

/** Bounds `parseAutomationStudioFailureRecord` enforces; a record that exceeds them is dropped, not truncated. */
export const AUTOMATION_STUDIO_FAILURE_RECORD_LIMITS = Object.freeze({
  codeMaxLength: 200,
  textMaxLength: 1024,
  /** An hour. The runtime honours far less than this; the bound only keeps a nonsense value off the record. */
  retryAfterMsMax: 3_600_000
});

/**
 * A structured failure. Core owns the category names; the producer owns
 * `code`. Carried as `failure` on client-gateway action results, runtime
 * command results, output dispatch results, node execution results, attempt
 * traces, and run action records. Validate any value that crossed a process or
 * storage boundary with `parseAutomationStudioFailureRecord`.
 */
export type AutomationStudioFailureRecord = {
  category: AutomationStudioAdaptiveFailureClass;
  /** Producer-owned stable machine code, for example `web.target.selector_miss`: letters, digits, `.`, `_`, `:`, `-`. */
  code: string;
  /** True when retrying the same action unchanged can succeed without a person or a Flow edit. */
  retryable: boolean;
  stage?: AutomationStudioFailureStage;
  /** A short description of what was expected. Never raw page content, credentials, or recorded data. */
  expected?: string;
  /** A short description of what was observed instead, under the same rule as `expected`. */
  actual?: string;
  /** Lowercase SHA-256 hex digest of the failure evidence packet captured with this failure. */
  evidenceDigest?: string;
  /**
   * The producer's statement about the act (`AUTOMATION_STUDIO_FAILURE_EFFECTS`):
   * `unacted` when it demonstrably did not happen, so a node that acts on the
   * world may still be repeated.
   */
  effect?: AutomationStudioFailureEffect;
  /**
   * How long the source said to wait before the same request is made again, in
   * whole milliseconds: a page's "try again in 12 seconds". Only on a retryable
   * record; the runtime bounds what it honours.
   */
  retryAfterMs?: number;
};
