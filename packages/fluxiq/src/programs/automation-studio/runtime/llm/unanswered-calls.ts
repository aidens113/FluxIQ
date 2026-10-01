// A model provider that is not answering: counted on its own, and an unbroken
// run of it ends the loop as exactly that.
//
// **The failure this closes (live run `run-muq05kas-058193f0`, 2026-10-01,
// during a DeepSeek outage).** Every decision call waited out its 45-second
// deadline and came back `llm.provider_timeout`. The loop read each one as an
// unusable decision: it told the model its decision could not be used --
// a decision the model never made -- and asked again, eight times, six
// minutes in all. Then the round counted as stalled, the build "explored
// again", and a second round began waiting in turn, while the person's chat
// said "Thinking about the next step" the whole time.
//
// Nothing arrived, so nothing was wrong with the model's work and nothing is
// said to the model. A timeout, an unreachable network, a server error and a
// rate limit are the provider not answering; one of them followed by an answer
// is a moment, and the loop asks again. Three in a row is an outage, and the
// loop ends `llm_evidence_loop.provider_unavailable` rather than spending the
// person's time on more waits: the build says so plainly and keeps what it
// had (`../flow-bootstrap/unfinished-build/provider-unavailable.ts`).

/** Unanswered decision calls in a row after which the loop ends. */
export const AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_MAX_PROVIDER_UNANSWERED_IN_A_ROW = 3;

/**
 * The provider codes for a call that got no answer. A reply that arrived and
 * could not be read is not one (`./unreadable-reply.ts`). `llm.provider_http_error`
 * reaches the loop only as a server error: any other status ends the loop
 * before it is asked again (`./failure-disposition.ts`).
 */
const UNANSWERED_CODES: ReadonlySet<string> = new Set([
  "llm.provider_timeout",
  "llm.provider_network_error",
  "llm.provider_http_error",
  "llm.provider_rate_limited"
]);

/** What each code means for the person, as a clause. */
const CODE_SAID: Readonly<Record<string, string>> = Object.freeze({
  "llm.provider_timeout": "it did not answer before the time allowed for each request ran out",
  "llm.provider_network_error": "it could not be reached",
  "llm.provider_http_error": "it answered with a server error",
  "llm.provider_rate_limited": "it turned the requests away as too many"
});

/** Whether a failed decision call's codes say the provider gave no answer. */
export function automationStudioLlmProviderUnanswered(issueCodes: readonly string[]): boolean {
  return issueCodes.length > 0 && issueCodes.every((code) => UNANSWERED_CODES.has(code));
}

/** How a loop the provider stopped answering ended. */
export type AutomationStudioLlmEvidenceLoopProviderUnavailable = {
  /** The unbroken run of unanswered calls that ended the loop. */
  inARow: number;
  /** The codes of that run, commonest first. */
  codes: string[];
  /** The commonest, said in words, for the build's ending to quote. */
  said: string;
};

/** The loop's count of unanswered decision calls. */
export type AutomationStudioLlmProviderUnansweredCount = {
  /** Something arrived, whatever it then said: the run is broken. */
  answered(): void;
  /** One more call with no answer. True when it is the one that ends the loop. */
  unanswered(code: string): boolean;
  summary(): AutomationStudioLlmEvidenceLoopProviderUnavailable;
};

export function automationStudioLlmProviderUnansweredCount(maxInARow: number = AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_MAX_PROVIDER_UNANSWERED_IN_A_ROW): AutomationStudioLlmProviderUnansweredCount {
  let run: string[] = [];
  return {
    answered() {
      run = [];
    },
    unanswered(code) {
      run.push(code);
      return run.length >= maxInARow;
    },
    summary() {
      const counts = new Map<string, number>();
      for (const code of run) counts.set(code, (counts.get(code) ?? 0) + 1);
      const codes = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([code]) => code);
      return { inARow: run.length, codes, said: CODE_SAID[codes[0] ?? ""] ?? "it did not answer" };
    }
  };
}
