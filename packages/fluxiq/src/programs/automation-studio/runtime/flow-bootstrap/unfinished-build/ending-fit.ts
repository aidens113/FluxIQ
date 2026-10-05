// How an ending's message is fitted to the length a build ending may carry,
// never by cutting a sentence (t193 round 1003).
//
// Live run `run-mustzxhi-2e2cda87` ended "... The Flow so far was kept as a
// draft, not put into the. What you asked is saved on the Flow ...": the
// not-finished message was sliced to `AUTOMATION_STUDIO_FLOW_BOOTSTRAP_BUILD_ENDING_MAX_MESSAGE`
// because its still-to-do list quoted four acts nearly whole, and the cut fell
// inside the sentence that says the draft was kept. Now the parts that grow --
// how many acts the still-to-do list quotes, how long each quote is, how much
// of the judge's words is said -- are said with less room, step by step, until
// the whole message fits. The closing sentences (what was kept, what was
// tried) are always said whole. Only if the tightest room still does not fit
// are whole sentences of the body left out from its end, and the first part is
// cut at a sentence end as the very last resort, never inside a sentence.
import { AUTOMATION_STUDIO_FLOW_BOOTSTRAP_BUILD_ENDING_MAX_MESSAGE } from "../generation-failure/index.ts";

/**
 * How much room the growing parts of an ending are given: how many acts and
 * choices still to do are quoted (the rest said as "and N more"), how long
 * each quote may be, and how long the judge's words may be.
 */
export type AutomationStudioFlowBootstrapEndingRoom = { most: number; quote: number; judge: number };

/** Each room, widest first. The widest is what every ending said before t193 round 1003. */
const ROOMS: readonly AutomationStudioFlowBootstrapEndingRoom[] = Object.freeze([
  { most: 4, quote: 90, judge: 200 },
  { most: 3, quote: 70, judge: 160 },
  { most: 2, quote: 60, judge: 120 },
  { most: 1, quote: 50, judge: 90 },
  { most: 1, quote: 40, judge: 60 }
]);

/**
 * The ending's message, in the widest room it fits: `say` gives the body
 * (sentences that may be left out from the end, the first kept longest) and
 * the close (sentences always said whole, in order, at the end).
 */
export function automationStudioFlowBootstrapEndingFitted(
  say: (room: AutomationStudioFlowBootstrapEndingRoom) => { body: readonly string[]; close: readonly string[] },
  max = AUTOMATION_STUDIO_FLOW_BOOTSTRAP_BUILD_ENDING_MAX_MESSAGE
): string {
  let parts = { body: [] as readonly string[], close: [] as readonly string[] };
  for (const room of ROOMS) {
    parts = say(room);
    const message = joined([...parts.body, ...parts.close]);
    if (message.length <= max) return message;
  }
  const close = joined(parts.close);
  if (close.length > max) return sentencesWithin(close, max);
  const room = max - close.length - (close ? 1 : 0);
  const body = parts.body.filter(Boolean);
  // Whole parts of the body left out from its end, then the first cut at a sentence end.
  for (let keep = body.length - 1; keep >= 1; keep -= 1) {
    const kept = joined(body.slice(0, keep));
    if (kept.length <= room) return joined([kept, close]);
  }
  return joined([sentencesWithin(body[0] ?? "", room), close]);
}

function joined(parts: readonly string[]): string {
  return parts.filter(Boolean).join(" ");
}

/** The whole sentences that open `text` and fit in `room`; empty when not even the first does. */
function sentencesWithin(text: string, room: number): string {
  if (text.length <= room) return text;
  if (room <= 0) return "";
  const ends = [...text.matchAll(/[.!?](?=\s|$)/gu)].filter((end) => end.index !== undefined && end.index < room);
  const last = ends.at(-1)?.index;
  return last === undefined ? "" : text.slice(0, last + 1);
}
