// The counts-only account of a `recoveryContext`, for the intervention record
// and the run's `llmGate` metadata.
//
// An intervention already records the provenance of the failure evidence --
// schema version, byte count, digest -- rather than the evidence itself,
// because a run record that quoted the page back would be a second copy of the
// page in storage. The same rule applies here, and for the same reason: the
// context is what the model reads, and this is what a person, a test or the
// Lab reads afterwards to check that the model was told what it should have
// been told.
//
// So this carries section *names*, byte counts and reasons, and never a
// section's contents. A name is not content -- "the state diff was included,
// and cost 412 bytes" says nothing about the page -- and it is exactly what an
// assertion needs: the Lab can require that `state_diff` was included for W13
// without the Lab ever holding page data.
//
// The `omitted` half is the half that matters. It is what keeps "the context
// had no state diff", "the context's state diff did not fit" and "the state
// diff carried something Core would not pass on" three different readings a
// week later, rather than one silence.

import type {
  AutomationStudioRecoveryContextOmission,
  AutomationStudioRecoveryContextSection,
  AutomationStudioRuntimeRecoveryContext
} from "./recovery-context.ts";

export type AutomationStudioRecoveryContextSummary = {
  schemaVersion: "automation-studio.recovery-context-summary.v1";
  contextSchemaVersion: AutomationStudioRuntimeRecoveryContext["schemaVersion"];
  byteCount: number;
  byteBudget: number;
  /** How many of the contract's sections the context carries. */
  includedCount: number;
  included: Array<{ section: AutomationStudioRecoveryContextSection; byteCount: number }>;
  /** Every section that is not in `included`, each with why. Never empty unless every section was included. */
  omitted: AutomationStudioRecoveryContextOmission[];
  /** True when at least one section existed and the byte budget forced it out. Distinct from a section that was absent or withheld. */
  budgetTruncated: boolean;
};

export function summarizeAutomationStudioRuntimeRecoveryContext(context: AutomationStudioRuntimeRecoveryContext): AutomationStudioRecoveryContextSummary {
  return {
    schemaVersion: "automation-studio.recovery-context-summary.v1",
    contextSchemaVersion: context.schemaVersion,
    byteCount: context.byteCount,
    byteBudget: context.byteBudget,
    includedCount: context.included.length,
    included: context.included.map((entry) => ({ section: entry.section, byteCount: entry.byteCount })),
    omitted: context.omitted.map((entry) => ({ section: entry.section, reason: entry.reason, byteCount: entry.byteCount })),
    budgetTruncated: context.omitted.some((entry) => entry.reason === "byte_budget")
  };
}
