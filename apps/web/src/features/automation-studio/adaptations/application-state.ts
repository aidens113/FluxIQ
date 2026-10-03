/**
 * Whether a runtime patch was put into the Flow, read from the decision the
 * runtime recorded on the adaptation. Since t249 a patch the runtime may apply
 * on its own is held until a whole run from the Flow's start that ran it is
 * judged, and that settle records `applied` and, when it holds the patch back,
 * `notAppliedReason` (Core: `runtime/service/runtime-adaptation/judged-promotion.ts`).
 *
 * The adaptation detail carries the whole decision as `metadata.approvalDecision`;
 * an inbox row carries only those two fields, as `judgedApplication`.
 */
export type AdaptationApplication = {
  state: "applied" | "not_applied" | "waiting";
  /** The "In The Flow" heading. */
  title: string;
  /** The plain sentence that explains it. */
  detail: string;
  /** The "Current Decision" heading, which must agree with it. */
  decision: string;
  /** A few words for an inbox row. */
  short: string;
};

// The sentence and the inbox words for each reason the settle records, in the order Core lists them.
const NOT_APPLIED_REASONS: Record<string, { detail: string; short: string }> = {
  not_rerun: { detail: "No run went on to use this change: the run was not resumed after the repair, or the Flow was rebuilt before it reached the changed step.", short: "never run again" },
  run_cancelled: { detail: "The run that was trying this change was cancelled before it finished.", short: "run cancelled" },
  run_failed: { detail: "The run that tried this change did not reach the end of the Flow.", short: "run did not finish" },
  refuted: { detail: "The run that tried this change reached the end of the Flow, but its result was judged not to answer the request.", short: "result judged wrong" },
  not_judged: { detail: "The run that tried this change reached the end of the Flow, but nothing judged whether its result answered the request.", short: "result never judged" },
  run_parked: { detail: "The run that tried this change stopped to wait for a person, so its result was never judged.", short: "run waiting on a person" },
  run_errored: { detail: "The run that tried this change stopped on an error.", short: "run stopped on an error" },
  apply_failed: { detail: "The run was judged to answer the request, but writing the change into the Flow was refused.", short: "the Flow refused it" }
};

export function adaptationApplication(adaptation: any): AdaptationApplication | null {
  const decision = adaptation?.metadata?.approvalDecision ?? adaptation?.judgedApplication;
  if (!decision || typeof decision !== "object" || typeof decision.applied !== "boolean") return null;
  if (decision.applied) {
    const detail = "A whole run from the Flow's start used this change and its result was judged to answer the request.";
    const reverted = adaptation.status === "reverted";
    return {
      state: "applied",
      title: "Applied to the Flow",
      detail: reverted ? detail + " It was reverted later." : detail,
      decision: "Allowed automatically and applied",
      short: reverted ? "Applied, then reverted" : "Applied to the Flow"
    };
  }
  const reason = typeof decision.notAppliedReason === "string" ? decision.notAppliedReason : "";
  if (!reason) {
    return {
      state: "waiting",
      title: "Waiting for a judged run",
      detail: "Held back until a whole run from the Flow's start uses this change and its result is judged.",
      decision: "Allowed automatically, waiting for a judged run",
      short: "Waiting for a judged run"
    };
  }
  const known = NOT_APPLIED_REASONS[reason];
  const explained = known?.detail ?? `The runtime held it back with a reason this page does not describe yet (${reason}).`;
  const refusal = reason === "apply_failed" && typeof decision.error === "string" && decision.error ? ` The Flow said: ${decision.error}` : "";
  const appliedByPerson = adaptation.status === "applied";
  return {
    state: "not_applied",
    title: "Not applied to the Flow",
    detail: explained + refusal + (appliedByPerson ? " A person applied it later through review." : ""),
    decision: "Allowed automatically, but held back",
    short: appliedByPerson ? "Held back, then applied by a person" : `Not applied: ${known?.short ?? reason}`
  };
}
