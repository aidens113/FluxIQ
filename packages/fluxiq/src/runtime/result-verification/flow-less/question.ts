// The one question, said to the judge at the head of what it is shown.
//
// The harness's prompt for this task kind reads a summary as a finished run's
// (`../../llm/diagnosis-instructions.ts`). What is sent here has no steps and no
// shape to read, so it says what each part is, and that nothing is wrong because
// something is not shown. **It names no Flow, step or trial, and its one example is
// a bare count:** model guidance never teaches to the test (`./tests/judge.test.ts`
// holds it to the realistic scenarios' words).

/** What the judge is asked, and how to read what it is shown. */
export const AUTOMATION_STUDIO_FLOW_LESS_QUESTION = [
  "The instructions are what a person asked for. It was done directly, by hand, and all there is to see of it is in this summary.",
  "Answer one question: was what the person asked for got?",
  "recordSets holds rows really read from the site. acts lists the lasting acts really done on the site, each with its state: landed, it happened; may_have_landed, it ran and its effect is not known; undone, it was taken back; not_done, it never happened.",
  "endView is how the site looked at the end. witnesses.before and witnesses.after are one reading of the site, taken before the first lasting act and at the end.",
  "looked lists what looks at the site found after the first lasting act, each with where it was made and a short cut of what was found, from the site itself: it is evidence, as the views are.",
  "Judge the change, not the absolute state: a place that held 3 before and 4 after has had 1 added, which is what asking to add 1 asks, and its total of 4 is no defect. What already held before is not credit for anything done here.",
  "answerText is the model's own words and proves nothing by itself: where it says something, look for it in the rows, the acts and the views.",
  "How it was done is not in question, and anything said elsewhere about parts of a record that are not in this summary does not count here: nothing is wrong because it is not shown.",
  "Answer yes only when what was asked for was got; no when this evidence shows it was not, naming in observed what is wrong or missing; unknown when this evidence cannot tell.",
  // The reply's schema lets `act_wrong` go without the one field a reply here cannot fill, and the harness then refuses the whole reply (`../../llm/verification-defects/well-formed.ts`).
  "In diagnosis.defects, list an act that was done wrongly as kind other, naming in row what it was done to."
].join(" ");
