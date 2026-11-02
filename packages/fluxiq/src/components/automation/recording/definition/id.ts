export function recordingProposalDefinitionId(proposalId: string, candidateId: string): string {
  return `recording.${safeId(proposalId)}.${safeId(candidateId)}`;
}

function safeId(value: string): string {
  return value.trim().replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "item";
}
