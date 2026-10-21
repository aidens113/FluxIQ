// The supervisor's reason without its opening restatement of the ending (t753).
//
// Round 5 read "The build failed: FluxIQ could not finish the Flow: I could not
// finish this. Saving ...": Core says the ending's kind, and the model's reason
// opened on the same verdict in its own words. A reason's opening sentences
// that say only that it could not finish, complete or build -- naming nothing
// beyond "this", "it" or the Flow -- give way, so the reason opens on why.
// Everything after them is kept as it was.

/** A sentence that only says the build could not finish (header). */
const RESTATED = /^(?:I|we|FluxIQ|the build|it)\s+(?:could not|couldn['’]t|cannot|can['’]t|was unable to|wasn['’]t able to|did not|didn['’]t|failed to)\s+(?:finish|complete|build)(?:\s+(?:this|it|the flow|the task|the build|the automation|this flow|this task))?(?:\s+(?:here|now))?\s*[.!…]?$/iu;

/** `reason` with its opening sentences that only restate the ending left out (header); what is left may be empty. */
export function automationStudioProjectBuildReasonUnrepeated(reason: string): string {
  const sentences = reason.trim().split(/(?<=[.!?…])\s+/u);
  while (sentences.length && RESTATED.test(sentences[0]!.trim())) sentences.shift();
  return sentences.join(" ").trim();
}
