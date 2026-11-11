// What the Flow-less judge reads and what it answers (plan D9, `./index.ts`).

import type { AutomationStudioAttemptAct } from "@fluxiq/contracts/automation";
import type { JsonObject } from "../../../core/index.ts";
import type { AutomationStudioLlmHarnessInput, AutomationStudioLlmProvider, AutomationStudioLlmTaskResult } from "../../llm/index.ts";
import type { AutomationStudioLlmTokenLimits } from "../../models/limits/index.ts";
import type { AutomationStudioResultEndView } from "../contracts/index.ts";
import type { AutomationStudioFlowLessReadLeftOut } from "./read-left-out.ts";

/** What an attempt got, with no Flow behind it. */
export type AutomationStudioFlowLessSummary = {
  /** What the person asked for, in their words. */
  instructions: string;
  /** Rows real reads returned. A model never writes one. */
  rows?: { totalRows: number; truncated: boolean; columns: { id: string; label: string }[]; rows: JsonObject[] };
  /** Lasting acts, from Core's act record. */
  acts: readonly AutomationStudioAttemptAct[];
  /** The model's words, marked as such wherever they are shown. */
  answerText?: string;
  /** How the site looked at the end, as the domain produced it. */
  endView?: AutomationStudioResultEndView;
  /** The same reading of the site before the first lasting act and at the end: the change is what is judged. */
  witnesses?: { before?: JsonObject; after?: JsonObject };
  /** What looks at the site found after the first lasting act, from each call's own answer and never a model's words: where (the page's address) and a short screened cut of what was found, the latest few. */
  looked?: readonly { where: string; found: string }[];
  /**
   * For a result made of rows: one entry per read that makes up the list, oldest first, with where it read (the view of
   * the site and the place in it, where said), how many rows it kept and, where held, those rows (`rows`) and what its
   * own conditions left out (`leftOut`, `./read-left-out.ts`). The rows may come from pages the end view is not on.
   */
  readPages?: readonly { where?: string; place?: string; kept: number; rows?: readonly JsonObject[]; leftOut?: AutomationStudioFlowLessReadLeftOut }[];
  /** The person asked for it to be done once more (a Run again): the judge is told so (`./asked-again.ts`). Only a route sets it, never a model. */
  askedAgain?: true;
};

export type AutomationStudioFlowLessJudgeInput = {
  summary: AutomationStudioFlowLessSummary;
  provider: AutomationStudioLlmProvider;
  /** The harness runner. The caller may wrap it to record the call's receipt. */
  run: (input: AutomationStudioLlmHarnessInput) => Promise<AutomationStudioLlmTaskResult>;
  /** The harness needs both to pack a request. */
  projectId: string;
  flowId: string;
  runId?: string | undefined;
  /**
   * The bound domain's declared denied keys, required: a provider refuses a
   * result summary with no declaration, because absent means nobody said, never
   * "deny nothing" (`../../llm/harness/request-evidence-check.ts`). A domain with
   * nothing to deny declares `[]`.
   */
  deniedEvidenceKeys: readonly string[];
  timeoutMs?: number | undefined;
  /**
   * The judging model's window, as its resolution gives it (the attempt's provider's, when no role routes the judge
   * elsewhere). Absent, the harness's default largest window, which a smaller-window model's adapter would refuse a
   * request to by size. A routed judge model's own limits, said on its provider, still win (`../../llm/harness/served-limits.ts`).
   */
  tokenLimits?: Partial<AutomationStudioLlmTokenLimits> | undefined;
  /** The whole check's deadline. Absent, the verification deadline for `timeoutMs`. */
  deadlineMs?: number | undefined;
  /** How long this work has waited for a person: the deadline does not count it. Absent, nothing. */
  personHeldMs?: (() => number) | undefined;
  signal?: AbortSignal | undefined;
};

/**
 * `not_judged` is a call that gave nothing, and says nothing about the answer:
 * `refusedByPurse` where the attempt's money would not pay for it, `unanswered`
 * for anything else.
 */
export type AutomationStudioFlowLessJudgement = {
  verdict: "yes" | "no" | "unsure" | "not_judged";
  /** Screened: it goes back to a model and to the chat. */
  reason: string;
  /**
   * What the check says of the result, for the card, in Core's counts or the check's own screened words, and by its
   * verdict: on a yes what was checked, on a no what failed, on an unsure what it was meant to settle. Set when a judge answered.
   */
  checkedWhat?: string;
  refusedByPurse?: boolean;
  /** The model service said the account has no balance: an ending of the attempt, never a check that was merely not answered. */
  emptyBalance?: boolean;
  unanswered?: boolean;
};
