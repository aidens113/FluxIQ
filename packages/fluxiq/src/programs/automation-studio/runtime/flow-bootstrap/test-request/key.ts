/** A test's backend-owned proposal identity, scoped by its loop; never the model's optional receipt fields. */
export function automationStudioCandidateTestRequestKey(latest: { revision: number; digest: string } | undefined): string {
  return latest ? `proposal:${latest.revision}:${latest.digest}` : "proposal:unsubmitted";
}
