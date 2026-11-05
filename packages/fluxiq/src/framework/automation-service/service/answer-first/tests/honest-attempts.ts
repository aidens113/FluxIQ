// A first attempt written the way the plan has it, which is what the second attempt's proofs start
// from: read the list, the first row by hand, the step made a repeat over the list with a `$row`
// binding, a forward run on the rest. A lending library is none of the Lab's realistic scenarios.

import type { JsonObject } from "../../../../../core/index.ts";
import { complete } from "./fake-library.ts";
import { readLoans } from "./later-attempts.ts";
import { ATLAS, forwardFrom, pressCardByHand, pressLoanByHand, TITLES } from "./library-site.ts";

export const LOAN_TASK = "Renew every loan on my library account and list them.";
export const CARD_TASK = "Renew the card on my library account.";
export const BOTH_TASK = "Renew every loan on my library account, renew the card, and list the loans.";
export const PERMITTED = { permittedConsequences: ["modify_existing" as const] };
/** A first attempt's steps: its opening look is 1, the read 2, the row's press 3, and whatever comes after that. */
export const READ_STEP = 2;
export const LOAN_STEP = 3;

type Attempt = { instruction: string; permittedConsequences: ["modify_existing"]; script: JsonObject[] };

/** Made a repeat over the list, and bound to the row each pass is on: in this order, since a `$row` binding needs the repeat first. */
export const repeatOverRows = (step = LOAN_STEP, over = READ_STEP): JsonObject => ({ kind: "amend_draft", amendments: [{ step, change: "repeat", over }, { step, change: "bind", input: { title: { $row: "title" } } }] });

export const honestFirstAttempt = (instruction = LOAN_TASK): Attempt => ({
  instruction, permittedConsequences: ["modify_existing"],
  script: [readLoans(), pressLoanByHand("first", ATLAS), repeatOverRows(), forwardFrom(READ_STEP), complete("Renewed every loan and listed them.")]
});

/** The same, and the card after the rows. */
export const honestFirstAttemptWithCard = (): Attempt => ({
  instruction: BOTH_TASK, permittedConsequences: ["modify_existing"],
  script: [readLoans(), pressLoanByHand("first", ATLAS), repeatOverRows(), forwardFrom(READ_STEP), pressCardByHand(), complete("Renewed every loan and the card, and listed them.")]
});

/** A first attempt that only presses the card, for what happens to one press. */
export const cardFirstAttempt = (instruction = CARD_TASK): Attempt => ({
  instruction, permittedConsequences: ["modify_existing"], script: [pressCardByHand(), complete("Renewed the card.")]
});

export const onceEach = (titles: readonly string[] = TITLES, times = 1): Record<string, number> => Object.fromEntries(titles.map((title) => [title, times]));
