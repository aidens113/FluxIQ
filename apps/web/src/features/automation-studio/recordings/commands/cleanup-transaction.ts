import {
  recordingCommandPostflight,
  recordingCommandPreflight,
  recordingThrownFailure,
  type AutomationRecordingCommandOutcome,
  type AutomationRecordingCommandScope,
  type AutomationRecordingScopeGuard
} from "./command-contracts";

export type AutomationRecordingCleanup = {
  recordingIds: readonly string[];
  proposalIds: readonly string[];
  invalidationScopes: readonly ["recording", "timeline", "proposal", "summary"];
  invalidationEntityIds: readonly string[];
};

export type AutomationRecordingCleanupTransaction = {
  commit(cleanup: AutomationRecordingCleanup): void | Promise<void>;
};

export function buildAutomationRecordingCleanup(
  recordingIds: readonly string[],
  proposalIds: readonly string[] = []
): AutomationRecordingCleanup {
  const uniqueRecordingIds = [...new Set(recordingIds.filter(Boolean))];
  const uniqueProposalIds = [...new Set(proposalIds.filter(Boolean))];
  return {
    recordingIds: uniqueRecordingIds,
    proposalIds: uniqueProposalIds,
    invalidationScopes: ["recording", "timeline", "proposal", "summary"],
    invalidationEntityIds: [...uniqueRecordingIds, ...uniqueProposalIds]
  };
}

export async function commitAutomationRecordingCleanup(
  input: {
    scope: AutomationRecordingCommandScope;
    recordingIds: readonly string[];
    proposalIds?: readonly string[];
    signal?: AbortSignal;
  },
  capabilities: AutomationRecordingScopeGuard & { transaction: AutomationRecordingCleanupTransaction }
): Promise<AutomationRecordingCommandOutcome<AutomationRecordingCleanup>> {
  const preflight = recordingCommandPreflight<AutomationRecordingCleanup>(input.scope, capabilities, input.signal);
  if (preflight) return preflight;
  const cleanup = buildAutomationRecordingCleanup(input.recordingIds, input.proposalIds);
  try {
    const beforeCommit = recordingCommandPostflight<AutomationRecordingCleanup>(input.scope, capabilities, input.signal);
    if (beforeCommit) return beforeCommit;
    await capabilities.transaction.commit(cleanup);
    return { status: "success", value: cleanup };
  } catch (error) {
    return recordingThrownFailure(error, input.signal, "Recording cleanup could not be committed.");
  }
}
