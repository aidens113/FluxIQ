// One action FluxIQ took, ready for its card in the chat: Core's shared
// reading of the event (`activityActionOf` in `fluxiq/ui`: the kind that
// picks the icon and the card's name, what it acted on, where it stands, and
// why it failed) plus what the chat needs to keep the card in place and say
// it in words. No DOM.
//
// Where a card stands comes from `activityActionOf` alone. A question to the
// person (an `ask`: a robot check or a permission) waits on them until Core's
// row that settles it says how it ended (`detail.resolution`); that row's
// sentence ("You pressed Continue.") is the card's `answer`. Nothing here
// reads the resolution's values, so a new one needs no change. Core's own
// sentence about any other action (`said`) is kept only when it is in words;
// a line that names an id or a result code ("Result: web.click.succeeded ·
// Node: web.output.dom-click") is not words. Core's marks that a step was part
// of a test run (`testing`), that a result check could not confirm the
// result (`unconfirmed`), and that Core declined a decision before doing it
// (`refused`: a call refused as a repeat, an edit refused in whole or in
// part, with Core's plain reason) are carried as Core gave them.

import { activityActionOf, type ActivityAction } from "fluxiq/ui";
import { declinedSubmission, type ClientGatewayActivity } from "fluxiq/ui";
import { isAlreadyDoneStep } from "./already-done.ts";
import { stepWords } from "./words.ts";

/** An action's card. */
export type ActionCard = ActivityAction & {
  /** `action:<activityId>#<sequence>` of the event that opened it: stable for its life. */
  key: string;
  /** Core's sentence about it, in words; undefined when there is none, and always for a question to the person. */
  said: string | undefined;
  /** Core's sentence on how a wait on the person ended ("You pressed Continue."); undefined until the row that settles it. */
  answer: string | undefined;
  /** True for a result check, which passes or does not rather than working or not. */
  check: boolean;
  /** How many identical cards that did nothing this card stands for (`card-repeats.ts`); absent for one. */
  times?: number;
  /** The steps done again this card stands for, itself first, when it is one line for them (`done-again.ts`); absent otherwise. */
  again?: readonly ActionCard[];
  /**
   * On a step that worked when tried again: which try it was (2 for the
   * second), and why the first did not work; the failed card is taken into it
   * (`retried.ts`). Absent otherwise.
   */
  retried?: { tries: number; why: string | null };
  /**
   * A run step Core skipped because its act was already done in this run
   * (`already-done.ts`): its card reads "Already done" ("Confirm · Lin Zhao:
   * Already done", the row named as on any row's step card). Absent otherwise.
   */
  already?: true;
};

/**
 * A dotted id such as `web.output.dom-click` or `core.run_node`, anywhere in a
 * sentence: every part at least two characters, so an abbreviation ("e.g.",
 * "i.e.") is not one. "e.g" dropped a result check's whole sentence and its
 * card read a bare verdict (t277, R2-U-1 of `run-muwansvz-a2b4a987`).
 */
const DOTTED_ID = /\b[a-z][\w-]+(?:\.[\w-]{2,})+\b/iu;

/** The card for `event`, keyed `key`; null for an event that is no action (a thought, a note, a status). */
export function actionCard(event: ClientGatewayActivity, key: string): ActionCard | null {
  const detail = event.detail;
  if (detail === undefined || detail.kind === "thought" || detail.kind === "note") return null;
  const action = activityActionOf(event);
  if (action === null) return null;
  const words = stepWords(detail, event.step).text;
  const sentence = words !== undefined && !DOTTED_ID.test(words) ? words : undefined;
  const asked = detail.kind === "ask";
  const already = isAlreadyDoneStep(event);
  // A submission of steps Core refused and said nothing of in words is "not done", never a green
  // "Done" (`declinedSubmission`, t649); Core's own refusal, when it gave one, stands.
  const declined = action.refused === undefined ? declinedSubmission(event) : undefined;
  const refused = declined === undefined ? action.refused : { all: true, rerun: false, because: declined };
  return {
    kind: action.kind,
    // The act a person would name where it is narrower than the kind ("Choose", "Tick", "Next page"; Core's `activityActionOf`).
    ...(action.name === undefined ? {} : { name: action.name }),
    target: action.target,
    outcome: action.outcome,
    why: action.why,
    // What a test of the Flow did with a step it did not simply do again (Core's `activityActionTested`).
    ...(action.tested === undefined ? {} : { tested: action.tested }),
    // What a finished action came to (Core's `ActivityAction.result`: "13 rows from 5 pages", an edit's change), shown after "Done: ".
    ...(action.result === undefined ? {} : { result: action.result }),
    ...(action.testing ? { testing: true as const } : {}),
    ...(action.unconfirmed ? { unconfirmed: true as const } : {}),
    // What Core declined of a decision, and why (Core's `activityActionOf`, t193 1003 C13).
    ...(refused === undefined ? {} : { refused }),
    ...(already ? { already: true as const } : {}),
    key,
    said: asked ? undefined : sentence,
    answer: asked && detail.resolution !== undefined ? sentence : undefined,
    check: detail.kind === "check"
  };
}
