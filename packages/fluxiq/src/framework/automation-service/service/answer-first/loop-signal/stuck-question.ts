// The question loop detection's last rung puts to the person (plan D14, step 4), built from the
// loop's own evidence (run-mwc6ut8u-52e3c1b3, R7).
//
// Until then it was fixed text, "keep going, or stop here?", which asks nothing only the person
// knows: that run parked with most of its purse left, and its question gave the person nothing to
// answer with. Now it says what is stuck (the finding the ladder stopped on, or the check refusing
// the same result), what was tried (steers given, repeats refused, fresh starts from the page, and
// how many things did not work), and what the person can do: say in their own words where the
// thing asked for is shown or what to try, which later rounds follow (`../attempt/rounds.ts`), or
// press Stop. The attempt never waits for the answer: it is posted as it steers itself onto a
// different way (`../attempt/stuck-ask.ts`, `./stuck-steer.ts`), so the words say it carries on.
//
// Generic and the person's words: counts and closed words only, never a code, a tool id, a digest
// or a page's text. The one sentence not Core's is the check's own screened reason.

import type { AutomationStudioTaskAttemptLoopsCaught } from "@fluxiq/contracts/automation";
import type { AutomationStudioLlmLoopAttemptRecordData, AutomationStudioLlmLoopFinding, AutomationStudioLlmLoopUnchanged } from "../../../../../runtime/llm/repeat-guard/index.ts";

/** What the last rung stopped on: the loop's finding, and, where a completion was refused again, what the check said. */
export type AutomationStudioAnswerFirstStuck = {
  finding: Pick<AutomationStudioLlmLoopFinding, "pattern" | "repeats" | "unchanged">;
  /** The check kept refusing the same result: its screened reason, where it gave one. */
  completionRefused?: { reason?: string | undefined } | undefined;
};

/** What the attempt holds, as counts. */
export type AutomationStudioAnswerFirstStuckHeld = { rows: number; acts: number; answered: boolean };

const OPENING = "I keep getting stuck, so I am trying a different way, and asking you in case you can help.";
const YOU_CAN = "What you can do: tell me in your own words where what you asked for is shown, what to try differently, or what I may have misunderstood, and I will follow your words from then on. I carry on meanwhile; press Stop to end the task here, with the result as it stands.";

const UNCHANGED: Readonly<Record<AutomationStudioLlmLoopUnchanged, string>> = Object.freeze({
  page: "the page did not change",
  rows: "nothing new was read",
  acts: "nothing I did on the site took effect",
  draft: "my steps stayed as they were"
});

function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

function listed(parts: readonly string[]): string {
  if (parts.length <= 1) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
}

/** What is stuck, in one sentence. */
function stuckOn(stuck: AutomationStudioAnswerFirstStuck): string {
  if (stuck.completionRefused) {
    const reason = stuck.completionRefused.reason?.trim();
    return `What is stuck: the result I have keeps being refused, and I have found nothing new that would change that.${reason ? ` What was said about it: ${reason}` : ""}`;
  }
  const { pattern, repeats } = stuck.finding;
  const unchanged = stuck.finding.unchanged.map((word) => UNCHANGED[word]);
  const because = unchanged.length ? `: ${listed(unchanged)}` : "";
  if (pattern === "near_repeat") return `What is stuck: I kept making the same move on the same page, ${plural(repeats, "time")}, and it came to nothing${because}.`;
  if (pattern === "cycle") return `What is stuck: I kept going back and forth between the same steps, ${plural(repeats, "time")} over, with nothing new${because}.`;
  if (pattern === "no_progress") return `What is stuck: my last ${plural(repeats, "step")} each found nothing new${because}.`;
  if (pattern === "same_fix") return "What is stuck: I kept coming back to a fix that had already been tried and did not work.";
  if (pattern === "same_act") return `What is stuck: I did the same thing to the same item ${plural(repeats, "time")}, with nothing new read between them.`;
  return `What is stuck: the same step kept failing or changing nothing on the same page${repeats > 0 ? `, ${plural(repeats, "time")}` : ""}${because}.`;
}

/** What was tried, from the attempt's counts and record; nothing where nothing was. */
function triedWords(caught: AutomationStudioTaskAttemptLoopsCaught, tried: AutomationStudioLlmLoopAttemptRecordData): string | undefined {
  const sums = Object.values(caught).reduce((total, each) => ({ steered: total.steered + each.steered, refused: total.refused + each.refused }), { steered: 0, refused: 0 });
  const unhelpful = tried.tried.filter((entry) => entry.outcome !== "applied" || entry.pattern !== undefined);
  const tries = unhelpful.reduce((total, entry) => total + entry.times, 0);
  const parts = [
    ...(sums.steered ? [`I noticed I was repeating myself and changed course ${plural(sums.steered, "time")}`] : []),
    ...(sums.refused ? [`${plural(sums.refused, "repeated step was", "repeated steps were")} stopped before they ran`] : []),
    ...(tried.approaches ? [`I started afresh from the page as it stood ${plural(tried.approaches, "time")}`] : [])
  ];
  const sentences = [
    ...(parts.length ? [`What I tried: ${listed(parts)}.`] : []),
    ...(unhelpful.length ? [`In all, ${plural(unhelpful.length, "different thing")} did not get there, over ${plural(tries, "try", "tries")}.`] : [])
  ];
  return sentences.length ? sentences.join(" ") : undefined;
}

/** What the attempt holds so far, in plain counts. */
function heldWords(held: AutomationStudioAnswerFirstStuckHeld): string {
  const has = [...(held.rows ? [plural(held.rows, "row")] : []), ...(held.acts ? [`${plural(held.acts, "act")} on the site`] : []), ...(held.answered ? ["an answer in words"] : [])];
  return `What I have so far: ${has.length ? listed(has) : "nothing confirmed yet"}.`;
}

/** The person's question: what is stuck, what was tried, what the attempt holds, and what the person can do. */
export function automationStudioAnswerFirstStuckQuestion(input: {
  stuck: AutomationStudioAnswerFirstStuck;
  caught: AutomationStudioTaskAttemptLoopsCaught;
  tried: AutomationStudioLlmLoopAttemptRecordData;
  held: AutomationStudioAnswerFirstStuckHeld;
}): string {
  const tried = triedWords(input.caught, input.tried);
  return [OPENING, stuckOn(input.stuck), ...(tried ? [tried] : []), heldWords(input.held), YOU_CAN].join(" ");
}
