// A build's instructions as Core stored them, for the build episode's manifest
// context (D9): what the person asked the build, read the way the build reads
// them. Instructions that cannot be read are recorded as unread, with the kind
// of failure only; the build then meets and reports the same failure itself.

import type { AutomationStudioFlowInstruction } from "../../../model/index.ts";

type StoredInstructions = { read: true; items: unknown[] } | { read: false; failure: string };

/** The stored instructions' identity, wording, scope and standing, or why they could not be read. */
export async function automationStudioGatewayTraceStoredInstructions(read: () => Promise<readonly AutomationStudioFlowInstruction[]>): Promise<StoredInstructions> {
  let instructions: readonly AutomationStudioFlowInstruction[];
  try {
    instructions = await read();
  } catch (error) {
    return { read: false, failure: error instanceof Error ? error.name : "unreadable" };
  }
  const items = instructions.map((instruction) => ({
    instructionId: instruction.instructionId,
    title: instruction.title,
    body: instruction.body,
    scope: instruction.scope,
    status: instruction.status,
    requirement: instruction.requirement
  }));
  return { read: true, items };
}
