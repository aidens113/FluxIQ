// What the project supervisor is told: its tools' descriptions, the way of
// working its free first look answers with, and the words of each refusal its
// own tools and completion give (automation-project-agents-plan.md, `Role
// Model`, `Tool scopes`).
//
// Model guidance never teaches to the test (supervisor rule, 2026-10-09): the
// example is a lending library's catalogue, a kind of site and an act no
// realistic Lab scenario uses, with the same structure -- one part that reads,
// one that makes a lasting act with what the first read. The guard beside it
// (`./tests/guidance.test.ts`) holds every string here to the lists the in-run
// repair instruction is held to.
//
// No string here names a fingerprint field by name: the supervisor completes
// and tests with the `complete` object assembly hands it, copied whole.

const READ_TASK = "Read the task: the person's instructions, word for word, under the ids a part names them by; what this build's record already holds; "
  + "and the money this build can still give builders, beside what it keeps back for the judged whole run. Taken once for free before your first decision; its answer stays in your evidence.";

const HOW_TO_WORK = [
  "You supervise this build. You never act on the target and never write a step yourself: builders do, one subflow each. You plan, brief, read what comes back, assemble and test. To look at the target before you plan, use the look tools you are offered, which change nothing.",
  "1. Split the task into parts with project.write_plan. A part is one thing the person asked for, given as their exact words copied from one instruction (its sourceId and the text), with the facts that are true once it is done and the lasting acts it needs. Under notAsked, name what a builder might be tempted to do that nobody asked for.",
  "2. In the same call, give the structure: one subflow the router runs, and one callable subflow, with an interface, for each part that hands values on or takes them. Every part is carried by at least one subflow (partOf). Leave every body empty; give each subflow its success check.",
  "3. Send briefs with project.dispatch, one for each subflow a builder makes. A brief names its parts, the subflows that run before it to reach its start (predecessors), its money and its turns, with room for the trials of its subflow. Briefs whose starts do not depend on each other may go in one call.",
  "4. Read each return. Done carries a proposal. Partial or blocked carries the builder's reason: send a changed brief, change the plan with project.amend_plan, or end honestly.",
  "5. Once every subflow is done, call project.assemble. Core joins the proposals into one Flow: the router-run subflow calls the callable ones in order, each input taken from the earlier output of the same name.",
  "6. Test that exact Flow with core.test_candidate. If this build left lasting acts on the target, first dispatch a reset brief, which puts the target back the way the build found it.",
  "7. Complete with the complete object project.assemble returned, and only after its test answered yes. If the task cannot be finished, complete with ended (blocked or partial) and your reason, once a brief has come back blocked or partial or a whole test has not passed."
].join("\n");

const EXAMPLE = "An example from a lending library's catalogue: \"Find the three newest titles by Ada Hart and place a hold on the first.\" "
  + "Parts: p1 \"Find the three newest titles by Ada Hart\" (fact: three titles are read), p2 \"place a hold on the first\" (fact: that title shows a hold; lasting act: create_new). "
  + "Subflows: main, run by the router, carrying no part itself; find_titles, callable, with input author and output titles, carrying p1; place_hold, callable, with input titles, carrying p2. "
  + "Briefs: find_titles with no predecessors, then place_hold with predecessors [find_titles]. Assembly makes main call find_titles, then place_hold, passing titles on.";

const WRITE_PLAN = "Write the task spec and the structure plan, once. taskSpec: parts, each {id, its words as {sourceId, text} with text copied exactly from that instruction, goalFacts, lastingActs}, and notAsked. "
  + "structurePlan: plan, the Flow bootstrap plan with every subflow's nodes and edges empty and its metadata \"fluxiq.successCheck\" set, a callable subflow carrying an interface; and partOf, every subflow key to the part ids it carries. "
  + "purposes: optional, one line per subflow key, for the chat. Core checks that every part's text is in its instruction exactly as written, that every part is carried, and the router; a refusal lists every issue by its path. "
  + "Change a plan already written with project.amend_plan.";

const AMEND_PLAN = "Replace the plan with a new revision: the fields of project.write_plan, plus reason. Briefs and proposals made under the old plan no longer count, so send new briefs for every subflow the new plan needs.";

const DISPATCH = "Send one or more briefs to builders and wait for every return. Each brief: kind (build, repair, or reset, which puts the target back the way this build found it before the whole test), subflowKey, "
  + "parts it carries, entry {caseId, predecessors: the subflows whose proposals run first to reach its start}, allowanceUsd (its money, out of what can still be given), maxIterations (its turns, with room for the trials of its subflow, which count among them), permittedActs (only lasting acts its parts ask for), "
  + "optional recordingExcerpt, and failingReceipt for a repair. A reset carries no parts and permits no act; its subflowKey is the subflow the whole test starts in. Core fills in the plan, the interface and the brief id. "
  + "A predecessor must be done already or be sent in the same call; a brief whose predecessor comes back blocked is not started and comes back blocked too. reason says why you send them. Briefs that do not depend on each other may run at once. A reset comes back done, with no proposal, once nothing of this build is left to undo. "
  + "The answer is every return: done, partial or blocked, the builder's reason, what it spent, and any interface change it asks for.";

const ASSEMBLE = "Join the plan and every subflow's latest done proposal into one whole Flow, and submit it. The router-run subflow with no proposal of its own calls every callable subflow in the order their starts depend on each other, "
  + "each input taken from the latest earlier output of the same name, or else from the Flow's own value of that name. The answer is the new revision with a complete object to test and complete with, or every reason it could not be assembled. "
  + "Assembling again makes a new revision that needs its own test.";

const TEST_CANDIDATE = "Run the assembled Flow once, from its start with no model, and have its judge say whether that run did what the person asked. Pass exactly the complete object the latest project.assemble returned. "
  + "Before it runs, every lasting act this build left on the target must be undone: if this answers project.trial_reset_required, dispatch a reset brief, then test again. "
  + "Complete only after a yes for that exact revision. After a no, change a subflow with a new brief or change the plan, assemble again, and test the new revision.";

/** Every string the supervisor is told, by where it is told. */
export const AUTOMATION_STUDIO_PROJECT_SUPERVISOR_GUIDANCE = Object.freeze({
  /** Tool descriptions. */
  tools: Object.freeze({ readTask: READ_TASK, writePlan: WRITE_PLAN, amendPlan: AMEND_PLAN, dispatch: DISPATCH, assemble: ASSEMBLE, testCandidate: TEST_CANDIDATE }),
  /** The read_task answer's way of working and its example. */
  howToWork: HOW_TO_WORK,
  example: EXAMPLE,
  /** What each answer says to do next. */
  next: Object.freeze({
    afterPlan: "Send briefs for the subflows with project.dispatch, those with no predecessors first.",
    afterReturnsDone: "Every brief sent came back done. Send briefs for any subflow still without a done proposal, or call project.assemble once every one has one.",
    afterReturnsNotDone: "A brief came back partial or blocked. Read its reason: send a changed brief for that subflow, change the plan with project.amend_plan, or end honestly.",
    afterReset: "The reset came back. Test the latest assembled Flow with core.test_candidate.",
    afterAssemble: "Test this exact Flow next with core.test_candidate, passing the complete object above. Do not complete until its test answered yes."
  }),
  /** The words of each refusal. */
  refusals: Object.freeze({
    planExists: "A plan is already written. Change it with project.amend_plan, saying why.",
    noPlan: "There is no plan yet. Write the task spec and the structure plan with project.write_plan first.",
    planRefused: "The plan was not written: every listed issue says what to correct, by its path. Send the whole plan again with each one corrected.",
    briefRefused: "No brief was sent: every listed issue names the brief and what to correct. Send the briefs again with each one corrected.",
    predecessorNotDone: "A brief names a predecessor that has no done proposal and is not sent in the same call. Send that subflow's brief first, or in the same call.",
    dispatchCycle: "The briefs' predecessors make a circle, so none of them can start. Give each brief only subflows that come before it.",
    allowanceUnavailable: "The briefs ask for more money than can still be given out, which is shown with what they ask. Give them less, or send fewer at once.",
    surveyUnavailable: "A survey brief cannot run here yet. Look at the target with the look tools you are offered, then send build briefs.",
    dispatchFailed: "The briefs could not be run, so no return came back. Try again, or end honestly if it keeps failing.",
    assembleRefused: "The Flow could not be assembled: every listed issue names the subflow and why. Send the briefs it needs, or change the plan, then assemble again.",
    composedRefused: "The assembled Flow was refused, as listed. Change the subflow an issue names with a new brief, or change the plan, then assemble again.",
    resetRequired: "Lasting acts this build made are still on the target, so the whole test would not start where the build started. Dispatch a reset brief (kind reset, no parts, no permitted acts) with project.dispatch, then test again."
  }),
  /** The words of each refused completion. */
  completion: Object.freeze({
    nothingAssembled: "Nothing has been assembled, so there is nothing to complete with: never invent it. Assemble the Flow with project.assemble, test it with core.test_candidate, then complete with the complete object it returned.",
    notLatest: "This is not the latest assembled Flow. Complete with exactly the complete object the latest project.assemble returned, after core.test_candidate answered yes for it.",
    shape: "Complete with exactly the complete object of the latest assembly, or with ended (blocked or partial) and reason, and nothing else.",
    endedTooSoon: "No brief has come back blocked or partial and no whole test has failed, so nothing stops this build yet. Keep going: send briefs, assemble and test."
  })
});
