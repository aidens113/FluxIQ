// What the judge is told when the person asked for this to be done once more (t869): a person's Run
// again. Without it a judge reads "add one" against a place that now holds two and calls a right
// repeat wrong, or reads an earlier time's work as this one's. It is judged as every attempt is, on
// this time's own change from the before reading this time took, and it says so in general words.
// **It names no site, task or thing**: model guidance never teaches to the test
// (`./tests/judge.test.ts` holds it to the realistic scenarios' words).

/** Sent beside the question, only when the person asked for it to be done again. */
export const AUTOMATION_STUDIO_FLOW_LESS_ASKED_AGAIN = [
  "The person asked for this request to be carried out again, after it had been carried out before.",
  "witnesses.before was read at the start of this time, and acts are this time's own: judge what this time changed.",
  "Where the request adds or does something, doing it once more is right, and what the earlier time left is neither credit nor a defect.",
  "Where the request asks for something to be in a state, finding it already so and leaving it so is right.",
  "Doing it more than once more, or changing anything the request does not ask for, is wrong."
].join(" ");
