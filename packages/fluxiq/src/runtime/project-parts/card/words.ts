// Words a card shows, screened by the contract itself.
//
// The contract's own check for "words a person reads" is internal to it, and a
// second copy here would drift. So a candidate is put through the card parser as
// the name, purpose or port name of a throwaway card, and kept only if the parser
// finds nothing wrong with that field.
import { parseAutomationStudioSubflowCard } from "@fluxiq/contracts/automation";
import { automationStudioProjectCardWords } from "../../automation-activity/project/index.ts";

export type AutomationStudioPartWordsField = "name" | "purpose" | "port";

const ISSUE_OF: Record<AutomationStudioPartWordsField, string> = {
  name: "subflow_card.invalid_name",
  purpose: "subflow_card.invalid_purpose",
  port: "subflow_card.invalid_inputs"
};

const LIMIT_OF: Record<AutomationStudioPartWordsField, number> = { name: 200, purpose: 500, port: 200 };

const PROBE = {
  partId: "probe",
  version: 1,
  name: "probe",
  purpose: "probe",
  sites: [],
  inputs: [],
  outputs: [],
  fixedValues: [],
  lastingClasses: [],
  calls: [],
  shapeHash: "0".repeat(64),
  trust: { tier: "unproven", counts: { judgedYes: 0, zeroModelRuns: 0, failures: 0 } }
};

/**
 * The text as a line a person reads (spaces collapsed, digest-shaped runs
 * elided, cut to the field's bound), or undefined when it is empty or the
 * contract refuses it: an address, markup, a selector, a credential.
 */
export function screenedPartWords(text: string | undefined, field: AutomationStudioPartWordsField): string | undefined {
  if (text === undefined) return undefined;
  const plain = automationStudioProjectCardWords(text, LIMIT_OF[field]);
  if (!plain) return undefined;
  const probe = field === "port" ? { ...PROBE, inputs: [{ id: "probe", name: plain, required: false }] } : { ...PROBE, [field]: plain };
  const parsed = parseAutomationStudioSubflowCard(probe);
  return parsed.ok || !parsed.issues.includes(ISSUE_OF[field]) ? plain : undefined;
}
