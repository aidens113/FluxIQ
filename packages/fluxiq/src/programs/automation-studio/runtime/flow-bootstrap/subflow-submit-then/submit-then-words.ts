// What a subflow builder is told of testing a revision in the call that submits
// it (t811, `./submit-then.ts`, `../subflow-candidate/builder-loop.ts`): the submit tool's sentence
// and its `then` and `fromStepImpossible` inputs, the submit answer's `next`
// before and after a folded test, a `then` Core cannot read, and the line the
// chat shows when Core completes the brief on a yes. Generic words: never a
// scenario's site, product or task.

const TEST = "core.test_subflow";
const SUBMIT = "core.submit_subflow";

export const AUTOMATION_STUDIO_SUBFLOW_SUBMIT_THEN_WORDS = Object.freeze({
  /** Appended to the submit tool's description where a trial can run. */
  tool: `To test the revision a submission makes in the same call, give then (its description says how).`,

  /** The `then` input's description; `fromStep`, whether the port can run the part from a step. */
  then(fromStep: boolean): string {
    const from = fromStep
      ? ` {"from": "<step>"}: once accepted, run the part from that step on the page as it stands, with no judge, to check a repair -- as ${TEST} does with from; name the step as the script does.`
      : "";
    return `Optional: what Core does with the revision this call makes, in this same call. "test_whole": once accepted, the test ${TEST} makes with that revision and digest; ask it only when you believe the whole part works.${from} `
      + `Left out, the submission is only saved, as before. A refused submission tests nothing. The answer then adds tested -- the test's answer exactly as ${TEST} gives it -- and testedWith, the revision and digest it tested.`;
  },

  /** The `fromStepImpossible` input's description. */
  impossible: "Optional, beside then \"test_whole\" only: why a run from the failing step cannot check its repair, in a sentence.",

  /** The submit answer's `next` once its revision was tested in the same call. */
  tested: `This revision was tested in this same call: tested is that test's answer, exactly as ${TEST} gives it, and its instruction says what to do next.`,

  /** Appended to a plain submit answer's `next` where a trial can run: the same call can test. */
  plainNext: `Or test a revision in the call that submits it: ${SUBMIT} with then.`,

  /** What a `fromStepImpossible` sent without then "test_whole" is told: nothing read it. */
  impossibleIgnored: "fromStepImpossible is read only beside then \"test_whole\", so it was set aside.",

  /** A `then` Core cannot read: nothing was submitted. */
  invalid(fromStep: boolean): string {
    return `then must be "test_whole"${fromStep ? ` or {"from": "<step>"} with a step's name` : ""}, or left out to only save the submission. Nothing was submitted: send the submission again with then written so, or without it.`;
  },

  /**
   * The chat's line for a brief Core completed on a yes, as the folded reason's two parts. In the person's words: the
   * chat never names a brief, a subflow or a revision (`../../activity/wording/person-words.ts`, `ended-reason.ts`).
   */
  completed: Object.freeze({ did: "Finished this part of the task", because: "the latest version passed its test, so nothing was left to decide" })
});
