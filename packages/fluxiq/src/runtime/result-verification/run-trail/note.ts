// How a judge reads the trail, and how strict it is to be (t963, J2), said once beside every trail
// (`./trail.ts`), so the completion check, a finished run's check and a build's trial read it alike.
//
// **Why.** Live run `run-mwo3dp11-a47a032d`: 19 completion checks were shown seven correct rows, one end page
// and the reads' labels, and none of what the attempt did. They refused the rows 14 times: a condition the
// person asked for showed on every kept row's page but was no column of the table, so it was "not shown"; the
// attempt had used the site's own sort, which no row says, so the order was "unverified"; its next-page
// control had ended on the last page, so "later pages may exist". The same rows were judged yes, then no.
//
// **What it says.** Judge from what the attempt did and saw, and from the final data; a condition the trail
// shows held is met without a column for it; a sort or a filter the site applied counts; a list whose
// next-page control said there was no further page was read to its end; and a no or an unknown needs a
// concrete contradiction, or a named part of the request nothing in the whole trail bears on.
//
// **Generic.** It names no site, task, product or answer: model guidance never teaches to the test
// (AGENTS.md; `./tests/run-mwo3dp11-trail.test.ts` holds it to the ten realistic scenarios' words).

/** The trail's reading, in Core's words. */
export const AUTOMATION_STUDIO_RESULT_TRAIL_NOTE = [
  "trail is Core's own record of all that was done on the site to get this result, in the order it ran: every look at a page, every read and every act, each with what it was asked to do (asked), how it ended (outcome), where it was (where) and what the site answered there (found), whole. It is evidence from the site itself, as the rows and the views are, and the final data are what it came to.",
  "Judge the result from the trail and the final data together. What the trail shows the site did or showed counts: a sort, a filter or a search the site applied, the page each row was read from and what that page showed beside it, the conditions a read kept rows by, and where paging ended.",
  "A condition the person asked for is met where the trail shows it held for the rows kept, whether on the page a row was read from, by a filter the site applied, or by a condition the read kept rows by. Never require a row to carry a field the person did not ask for as a column of the answer.",
  "An order the person asked for is met where the rows keep the order of a site list the trail shows the site had sorted that way, and of the pages in the order they were read.",
  "Every page of a list was read where the trail shows the reads going on through the list's next-page control until the site answered that there is no further page.",
  "Answer no only on a concrete contradiction: a row, a value or an act that the trail or the final data show is wrong, or an item or a condition asked for that nothing in the whole trail supports, naming it. Answer unknown only where nothing in the trail or the final data bears on a part of the request, naming that part. A doubt that the trail answers is neither."
].join(" ");
