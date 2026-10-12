// What a run's last row says when the run stopped because a lasting act's
// outcome is unknown: the act may have gone through and nothing confirmed it,
// so the run did not repeat it (`executor/step-loop/uncertain-stop.ts` stamps
// `run.outcome_uncertain` on the trace's failure). "Run failed" over it read as
// though the act had not happened, which is the one thing the run cannot say.
//
// Read from closed codes only: the session trace's failure code, else the
// run record's `stopCode` (`service/summaries/run-stop.ts`). The chat shows the
// title and the sentence after it ("Stopped — not sure the last step went
// through, so it was not repeated."), and the live line the label.

type Fields = Readonly<Record<string, unknown>>;

/** The ending of a run stopped as Outcome uncertain, or undefined when neither the trace nor the record says it stopped so. */
export function automationStudioActivityRunUncertainEnding(trace: unknown, record: Fields | null | undefined): Readonly<{ title: string; label: string; text: string }> | undefined {
  const code = fields(fields(trace)?.failure)?.code ?? record?.stopCode;
  if (code !== "run.outcome_uncertain") return undefined;
  const text = "not sure the last step went through, so it was not repeated.";
  return { title: "Stopped", label: `Stopped: ${text}`, text };
}

function fields(value: unknown): Fields | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Fields : undefined;
}
