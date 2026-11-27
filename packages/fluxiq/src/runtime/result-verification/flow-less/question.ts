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
  "resultEvidence states the declared result: every contributing page with its current conditions and fields, kept rows and left-out evidence, the places read and what the pager said. Coverage is a fact to weigh, never a completeness verdict. A carried page came from an earlier attempt and was not read now. Working reads and looks are evidence outside the result. answerContract, where present, names the requested columns in order; a column it does not name was not asked for unless it is a named one under another name.",
  // The result's processing (t970): a filter on rows already read once left out three right rows, which only its left-out rows could show.
  "resultEvidence.processing, where present, is what was done to the rows the pages kept before they became the answer: declared, the declaration; how many rows were collected, left out, dropped as repeats, cut and kept; and per filter its words, how many rows it left out, and leftOutOnlyByThis, the rows it alone left out, by label. Check each filter against what was asked and each row it left out against the filter: a row left out that the request asks for is a concrete defect of the result, as a missing row is.",
  // The values processing read (t1072, run-mwyfoz8o-507c92f6): right rows in the right order were answered no because the sort key was in no row shown.
  "resultEvidence.processing.keptRows, where present, is each kept row in the answer's order: its asked columns, then every value the declaration's conditions, dedupe and order read on that row, a derived column as processing computed it beside the column it came from, and null where the row holds none. Check the order and each condition on these values: a value shown there is evidence, though the asked columns leave it out. resultEvidence.processing.hiddenSortKeys, where present, is each sort key the asked columns leave out as processing read it on the kept rows: what it read it as, on how many rows, a few readings, and for the first key inOrder, whether the kept rows run in that key's order as read. It is a reading, as the rows are: weigh it against keptRows.",
  "recordSets holds rows really read from the site. acts lists the lasting acts really done on the site, each with its state: landed, it happened; may_have_landed, it ran and its effect is not known; undone, it was taken back; not_done, it never happened.",
  "endView is how the site looked at the end. witnesses.before and witnesses.after are one reading of the site, taken before the first lasting act and at the end.",
  // The same words again (run-mw4eb5r3-a20f3542): an earlier attempt's act is carried, and with no word on what that means a judge asked for the act again and the model did it twice.
  "An act whose words begin 'Already done earlier' was done by an earlier attempt at these same words: it counts as got where the views agree it still stands, and finding the site as it left it is right, not a missing change; doing it again would be wrong. One whose words begin 'May already be done' counts as got only where the views show it.",
  "looked lists what looks at the site found after the first lasting act, each with where it was made and what was found there, whole, from the site itself: it is evidence, as the views are.",
  "readPages lists the reads the rows in recordSets came from, oldest first, each with where it read (the view of the site, and place, the position in it) and kept, how many rows it kept: the rows are those of every page listed, not only the page endView shows; a page with kept 0 was read the same way and held no row to keep. Where given, keptRows names by label the rows that read kept, and leftOut the rows that read found on the site and did not keep, each set under the conditions the read was asked with that left it out, with what a condition read on the items it left out where the read said: they are items the site showed, as the views are.",
  // A label kept by one read and left out by another (run-mwaudvnh-c208d32c): two judges took the two items for one.
  "Where a leftOut set gives sameLabelKept, each label named there is also the label of a row a read kept: the site showed two items under that label, the kept one met every condition of its read and the one in this set did not, so the label being both kept and left out is not one item both kept and dropped.",
  "Judge the change, not the absolute state: a place that held 3 before and 4 after has had 1 added, which is what asking to add 1 asks, and its total of 4 is no defect. What already held before is not credit for anything done here.",
  "answerText is the model's own words and proves nothing by itself: where it says something, look for it in the rows, the acts and the views.",
  // The trail (t963, run-mwo3dp11-a47a032d): a judge shown no record of how the rows were got refused right rows 14 times
  // for a condition with no column, a sort it could not see and paging it could not see end. How to read it is the
  // trail's own `note` (`../run-trail/note.ts`), shared with every other judge.
  "trail, where given, is how it was got: all that was done on the site for this result, in order, each with what the site answered there, read as trail.note says. It is evidence, as the rows and the views are. Anything said elsewhere about parts of a record that are not in this summary does not count here: nothing is wrong because it is not shown.",
  // A no that names nothing (t1072, run-mwyfoz8o-507c92f6, 0101): its own words said the rows were right and only one value unseen.
  "Answer yes when what was asked for was got, by the final data and what the trail shows of how they were got; no only on a concrete contradiction in this evidence, saying in observed what is wrong or missing and naming it in defects by the row, value, act or asked-for part; unknown only when nothing in this evidence bears on a part of what was asked, naming that part. A no that says nothing in observed and whose defects are only of kind other, or only values it also gives in checked as right, names no contradiction and is read as unknown. A condition the trail shows held is met even where no column of the rows says it.",
  // The reply's schema lets `act_wrong` go without the one field a reply here cannot fill, and the harness then refuses the whole reply (`../../llm/verification-defects/well-formed.ts`).
  "In diagnosis.defects, list an act that was done wrongly as kind other, naming in row what it was done to."
].join(" ");
