// A tally of the tests a project build asked that Core refused to run (t791).
//
// Crossborder `run-mvswhobv-5eb308c0` asked eleven tests and none ran: every one was refused before it started. Its
// ending said only that "nothing read afterwards could show whether they changed anything". A refused test's card
// carries the refusal in a person's words (`activity/candidate/trial-words.ts`, the `Declined` part of its text); this
// reads those cards as they are published and keeps how many there were and why, for the ending
// (`./record-told.ts`).

/** One activity event, as far as the tally reads it. */
export type AutomationStudioProjectBuildTestEvent = { detail?: { ref?: unknown; status?: unknown; text?: unknown } | undefined };

/** A test tool: `core.test_candidate`, `core.test_subflow`. */
const TEST_TOOL = /^core\.test_[a-z_]+$/u;
/** The refusal's words in a card's text (`activity/observer.ts`: parts joined by " · "). */
const DECLINED = /(?:^|\s·\s)Declined: ([^·]+)/u;

export type AutomationStudioProjectBuildTestsRefused = {
  /** Reads one published event; a refused test's card is counted. */
  observe(event: AutomationStudioProjectBuildTestEvent): void;
  /** How many tests were refused, and the distinct reasons in the order first given. */
  told(): { count: number; why: string[] };
};

/** A fresh tally (header). */
export function automationStudioProjectBuildTestsRefused(): AutomationStudioProjectBuildTestsRefused {
  let count = 0;
  const why: string[] = [];
  return {
    observe(event) {
      const detail = event.detail;
      if (!detail || typeof detail.ref !== "string" || !TEST_TOOL.test(detail.ref) || detail.status !== "failed" || typeof detail.text !== "string") return;
      const words = DECLINED.exec(detail.text)?.[1]?.trim();
      if (!words) return;
      count += 1;
      if (!why.includes(words)) why.push(words);
    },
    told: () => ({ count, why: [...why] })
  };
}
