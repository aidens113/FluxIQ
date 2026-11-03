import type { AutomationStudioFaultAssessment } from "./contracts.ts";
import { automationStudioFaultFromThrownError } from "./thrown-error.ts";

/**
 * A failed result that carried no structured failure record, classified from the
 * only thing it did carry: its message.
 *
 * Every node must get the default policy, including one that knows nothing about
 * Core's failure taxonomy. A custom node, a domain output written before the
 * taxonomy existed, a host dispatcher that returns `{ status: "failed", message }`
 * -- each of those was previously unretryable by construction, because the retry
 * decision asked a record that was never there.
 *
 * Reading prose is a weaker signal than a record, and it is treated as one:
 * nothing back means the default stands, which is to refuse. The producer's own
 * record always outranks this, so a node that states its failure properly is
 * never second-guessed by a phrase match.
 */
export function automationStudioFaultFromResultMessage(message: string | undefined): AutomationStudioFaultAssessment | undefined {
  if (!message?.trim()) return undefined;
  const assessment = automationStudioFaultFromThrownError(new Error(message), { now: 0, aborted: false });
  if (assessment.disposition !== "retry") return undefined;
  return {
    ...assessment,
    source: "result_message",
    reason: `${assessment.reason} The node reported no structured failure, so this was read from what it said.`
  };
}
