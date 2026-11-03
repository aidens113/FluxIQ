// How an answer to a question came out, for a caller that must know: the PIN
// dialog stays open on a refusal and says `error`. Never carries the PIN.

/** Taken, or not sent / refused, with the sentence a person reads. */
export type AnswerOutcome = { ok: true } | { ok: false; error: string };
