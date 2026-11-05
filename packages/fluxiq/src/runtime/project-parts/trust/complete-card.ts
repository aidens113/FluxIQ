import { parseAutomationStudioSubflowCard, type AutomationStudioSubflowCardParseResult } from "@fluxiq/contracts/automation";
import { deriveAutomationStudioPartTrust } from "./derive-trust.ts";
import type { AutomationStudioPartTrustEvidence } from "./types.ts";

const UNPROVEN = { tier: "unproven", counts: { judgedYes: 0, zeroModelRuns: 0, failures: 0 } } as const;

/**
 * The card the contract defines: a stored card (kept without trust) with the trust
 * its evidence earns now, parsed. A stored card the contract no longer accepts is
 * refused with its issues rather than shown.
 */
export function completeAutomationStudioPartCard(stored: unknown, evidence: readonly AutomationStudioPartTrustEvidence[]): AutomationStudioSubflowCardParseResult {
  const base = parseAutomationStudioSubflowCard({ ...(stored as Record<string, unknown>), trust: UNPROVEN });
  if (!base.ok) return base;
  return parseAutomationStudioSubflowCard({ ...base.card, trust: deriveAutomationStudioPartTrust({ evidence, lastingClasses: base.card.lastingClasses }) });
}
