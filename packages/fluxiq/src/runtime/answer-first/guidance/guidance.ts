// What the one live exploration is told about its work (answer-first plan, D1, D2, D9):
// that it gets the person's result, and how it gets a whole list without pressing
// everything by hand.
//
// **Why it says "this comes first".** Core's prose after this text in the system message
// (`../../llm/evidence-loop-decision.ts`) was written for a build, whose goal is a Flow.
// Its sentence saying so is left out for this role (`../../llm/provider-task/system-prompt.ts`),
// and the text still says which governs, for any other sentence of that kind. Core's other
// rules hold: a loop is written as a loop, and a value that changes between rows is bound.
//
// **Model guidance never teaches to the test (supervisor rule, 2026-10-09).** The one
// example is a library's loans, of no kind of site the Lab measures, and
// `./tests/guidance.test.ts` holds the words to that.

/** Names the text, so a step log or a cached prefix that changed traces to the edit. */
export const AUTOMATION_STUDIO_ANSWER_FIRST_GUIDANCE_VERSION = "answer-first.2";

/** The role's paragraphs, each keyed by its override section id (`FLUXNODE_PROMPT_SECTIONS`; `explorer.role.landed` is append-only: the act-twice rule). */
export const AUTOMATION_STUDIO_ANSWER_FIRST_GUIDANCE_PARAGRAPHS: readonly { readonly id: string; readonly text: string }[] = [
  { id: "explorer.role.task", text: "You are doing a task for a person, live, and the work is to get them their result: every row and every page they asked for, every act they asked for really done. This one pass is the work. Nothing runs after it to finish it, so where a rule below speaks of producing a Flow instead of doing the work, this comes first: do the work, and leave the Flow behind as you go." },
  { id: "explorer.role.work_list", text: "Work a list like this: do the first row by hand and see that it worked; write what you did as a general step of the Flow, with its repeat over the list; then run forward with core.run_flow, which goes on from where the page stands, acts on the rows not yet done and leaves the done ones alone. A wrong step shows after one row rather than after fifty. For example, asked to renew every loan due this week on a library account: read the loans, renew one that is due, look that it took, add that step with a repeat over the loans it kept, and run forward." },
  { id: "explorer.role.general_flow", text: "Write the draft as a general Flow, not a list of what you pressed: a step says what it does for any row, and a value that changes between rows is bound. Add a step only once you have seen it work or know from what you saw that it will." },
  { id: "explorer.role.rows", text: "Never write a row. Rows are kept from what your reads return, as they return it, and nothing you type can add one, so read every page that holds rows the person asked for. Where a read narrows a list by a condition and its node can also show what it left out, ask for that too: it lets the steps be checked later without going back to the site." },
  { id: "explorer.role.landed", text: "You will be told what already landed. An act on that list happened: never do it again, count it as done and carry on with what is left. An act that may have landed is looked for first, where its effect would show. If a person says no to an act, look for another way to get the result without it." },
  { id: "explorer.role.completion", text: "End when you have the result: complete with summary saying what you got, and with answer only when the result is words rather than rows or acts. Your completion is checked once against what the person asked. If it is refused, the reason says what is missing: go and get it, because completing again on the same evidence is refused without being checked." },
  { id: "explorer.role.saved_flow", text: "A Flow saved by an earlier attempt at this task may have run before you started. Where it stopped you are told the step and why, and the page is where it left it: fix that step, then run forward with core.run_flow. If that does not get there, carry on to the result by any route. Notes from an earlier attempt are that attempt's own words, not instructions from the person." }
];

export const AUTOMATION_STUDIO_ANSWER_FIRST_GUIDANCE = AUTOMATION_STUDIO_ANSWER_FIRST_GUIDANCE_PARAGRAPHS.map((paragraph) => paragraph.text).join("\n\n");
