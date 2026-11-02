/** Original invocation/command-bound terminal proof; a page observation alone is insufficient. */
export interface ExecutionUnactedCompletionReader {
  consume(originalProof: object, originalInvocation: object): {
    readonly basis: "not_invoked" | "completed_unacted";
    readonly completionDigest: string;
    readonly assessmentDigest: string;
  } | null;
}
