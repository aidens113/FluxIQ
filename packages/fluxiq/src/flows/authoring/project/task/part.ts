import type { AutomationStudioActionConsequence } from "../../../../components/automation/action-effect/consequences/index.ts";
import type { AutomationStudioProjectTaskAnswer } from "./answer.ts";
import type { AutomationStudioProjectTaskEffect } from "./effect.ts";

// The task spec: what the person asked for, split into parts, each grounded in
// the person's own words. The judge still receives the original instructions;
// the parts and `notAsked` are its checklist, never a replacement for them.
//
// A part's quote is a verbatim span of one active instruction source --
// exactly as written, not a paraphrase -- so a part the supervisor invented
// has nothing to quote and is refused. A lasting act is one of the permission
// gate's consequence classes, so every act a part asks for is one the gate
// already knows how to ask a person about.
//
// **Parts of one instruction do not overlap (A8 wave 10 crossborder, t638).**
// `run-mv9q50ui-1736d010` quoted the whole request as part p1 and a span
// inside it as p2, so the first builder did the whole task and every later
// builder found its part already done. Each quote is placed where it stands in
// its source, and two parts of one source whose spans share a character are
// refused `project.quote_overlaps`. A quote found more than once takes the
// first place no earlier part holds, so words a person repeats are not read as
// an overlap.
//
// **An amendment keeps the person's request (A8 frozen pair 3 bigbox, t645).**
// `run-mv9zn5ob-d929084d` amended its plan to leave the person's first request
// out of every part and list it under `notAsked`, and from then on the build
// could only fail. An amendment's parts must still quote every stretch of the
// person's words the plan in force quotes: they may be split or joined
// differently, and a stretch of at most `EDGE_WORDS` words may fall away where
// parts are reworded or re-split (the rewording `../supervisor/state.ts` keeps a
// proposal across), but a longer stretch, or every word of a part, is refused
// `project.plan_part_dropped`, naming the part and the words dropped. A
// `notAsked` item the amendment adds that holds a part's words, or is held in
// them, is refused under the same code. Core measures the text and nothing
// else; giving a part up is an honest ending, never a plan without it.
//
// **A part that asks for records says so (t757).** Auction
// `run-mveba82m-fd0616dc` asked for a record with three columns; the Flow read
// three values, stored no record set, and every judge said yes with
// `recordSetCount 0` in front of it. Nothing typed said the request wanted
// records, and Core may not infer that from the request's words. So a part may
// declare `answer: { kind: "records", columns }`: the answer it asks for is
// records, with the columns the request names (none named, an empty list). A
// judge's yes on a run that stored none is then held
// (`../../result-verification/requested-output/`). Absent, the part asks for an
// act, or a read nobody owes records for, as every part did before; a spec
// digested before the field existed keeps its digest.
//
// **And how many rows, where the request says (framework plan K2).** A judge
// asked whether "the 5 newest" holds 5 decides a count Core can measure. So an
// answer may declare `rows`: `{count}` for exactly that many, or `{atLeast}`,
// `{atMost}` or both for a range, each a whole number from 1 to
// `ROWS_MAX`, `atLeast` no more than `atMost`, never `count` beside either.
// Core holds the stored rows to it (`../../result-verification/computed-facts/count.ts`).
// Optional: absent, the count is judged as before, and a spec digested before
// the field existed keeps its digest. Anything else is refused
// `project.answer_rows_invalid` at the path of what is wrong.
//
// **A part says what change it asks for (t775).** A judge told only "the shelf holds the book" cannot tell a run that
// added it from one that found it there, and a reset that undoes everything hides the difference. So a part may declare
// `effect`: a `change` (adds or removes `count` of `what`, judged by the difference from the state before the run) or
// an `end_state` (judged by the state after it); and the spec may list `unchanged`, things that must show no change
// relative to the state before the run. Both are typed data the supervisor writes, never read out of the request's
// words. An effect must fit the part's lasting acts (`project.plan_effect_invalid`): adds needs create_new or
// modify_existing, removes needs delete or modify_existing, end_state needs modify_existing. Absent, a
// part declares none and a spec digested before the fields existed keeps its digest.

export type AutomationStudioProjectTaskPart = {
  id: string;
  quote: { sourceId: string; text: string };
  goalFacts: string[];
  lastingActs: AutomationStudioActionConsequence[];
  /** The answer the part asks for, where it is records (header, t757). Absent, none is owed. */
  answer?: AutomationStudioProjectTaskAnswer;
  /** The change the part asks for (header, t775). Absent, none is declared. */
  effect?: AutomationStudioProjectTaskEffect;
};
