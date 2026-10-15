// A finished trial with the shape of A8 social `run-mv9ml775-9872e63e` steps
// 0208 and 0214 (t636), on another kind of site: a makerspace's tool-booking
// waitlist. The Flow approved the bookings the request asks for and read the
// list twice: once by a bound on the safety sessions logged, which alone left
// out two rows whose number fails it and one row whose value the read found
// empty; once, after the approvals, by a text test of the item's own text,
// which alone left out each row its read found no approval text on. Both reads
// stored exactly the rows asked for. No task, site, product or answer of any
// realistic scenario.
import type { AutomationStudioRecordSchema } from "@fluxiq/contracts/automation-studio";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioFlowInstruction, AutomationStudioFlowNode, AutomationStudioFlowRunActionAttemptRecord } from "../../../../model/index.ts";
import type { AutomationStudioRunResultSummary } from "../../contracts/index.ts";
import { summarizeAutomationStudioRunResult } from "../../result-summary.ts";
import { datasetSummary } from "../../tests/run-outcome-harness.ts";

/** The request. */
export const WAITLIST_REQUEST = "Go through the tool booking waitlist and approve every booking whose member has logged at least 3 safety sessions, and leave every other booking waiting. "
  + "Then give me a table of every booking the list now shows as approved, in the order the list shows them, with columns member and sessions.";

export const WAITLIST_INSTRUCTION: AutomationStudioFlowInstruction = {
  schemaVersion: "0.1", instructionId: "instruction.flow.goal", title: "Goal", body: WAITLIST_REQUEST,
  scope: { kind: "flow", projectId: "project-1", flowId: "flow-1" }, priority: 1, status: "active", requirement: "required", createdAt: 1, updatedAt: 1
};

export const WAITLIST_ELIGIBLE_READ = "node.waitlist.eligible";
export const WAITLIST_APPROVED_READ = "node.waitlist.approved";

/** The stored rows of both reads: exactly the bookings the request asks to approve. */
export const WAITLIST_STORED: JsonObject[] = [
  { member: "Noor Haddad", sessions: "7 safety sessions" },
  { member: "Kwame Mensah", sessions: "3 safety sessions" },
  { member: "Ilse Vartanen", sessions: "12 safety sessions" }
];
/** Left out by the bound alone, each with its value: two numbers that fail it, and one the read found empty. */
export const WAITLIST_FEW: Array<[string, string]> = [["Rafael Ortiz", "1 safety session"], ["Hana Sato", "2 safety sessions"], ["Ben Okoro", ""]];
/** The member whose sessions the read found empty. */
export const WAITLIST_EMPTY = "Ben Okoro";

const schema: AutomationStudioRecordSchema = { schemaVersion: "0.1", fields: ["member", "sessions"].map((id) => ({ id, label: id, valueType: "string" as const })) };
/** Each column reads a part of the item; the text test reads the whole item, which no column does. */
const fields = { member: { kind: "text", selector: ".member-name" }, sessions: { kind: "text", selector: ".safety-sessions" } };

const readNode = (id: string, datasetId: string, where: JsonObject[]): AutomationStudioFlowNode => ({
  id, definitionId: "web.output.dom-extract_list",
  parameterValues: { extractList: { fields, where }, recordOutput: { datasetId, writeMode: "append" } }
});

/** The two reads as authored: a bound on the sessions column, and a text test of the item's own text. */
export const waitlistReadNodes = (): AutomationStudioFlowNode[] => [
  readNode(WAITLIST_ELIGIBLE_READ, "eligible", [{ field: "sessions", atLeast: 3 }]),
  readNode(WAITLIST_APPROVED_READ, "approved", [{ read: { kind: "text" }, contains: ["Booking approved"] }])
];

const attempt = (nodeId: string, order: number, conditions: JsonObject): AutomationStudioFlowRunActionAttemptRecord => ({
  attemptId: `attempt.${nodeId}`, nodeId, definitionId: "web.output.dom-extract_list", order, status: "succeeded", startedAt: order,
  metadata: { extraction: { recordCount: WAITLIST_STORED.length, pagesRead: 1, truncated: false, itemsSeen: 6, paginationStop: "control_absent", conditions } }
});

/** The reads' attempts: each left-out row with the witness its read sent. */
export function waitlistAttempts(): AutomationStudioFlowRunActionAttemptRecord[] {
  const items = [2, 4, 5];
  return [
    attempt(WAITLIST_ELIGIBLE_READ, 2, {
      applied: 6, kept: 3, unfiltered: false, rejected: [3], alone: [3], seen: [null],
      aloneRows: [WAITLIST_FEW.map(([member, sessions]) => ({ member, sessions }))],
      aloneObservations: [WAITLIST_FEW.map(([, sessions], at) => ({ conditionIndex: 0, state: "present", value: sessions, source: "field", readKind: "text", page: 1, item: items[at]! }))]
    }),
    attempt(WAITLIST_APPROVED_READ, 4, {
      applied: 6, kept: 3, unfiltered: false, rejected: [3], alone: [3], seen: ["Booking approved"],
      aloneRows: [WAITLIST_FEW.map(([member]) => ({ member }))],
      aloneObservations: [WAITLIST_FEW.map((_row, at) => ({ conditionIndex: 0, state: "absent", source: "read", readKind: "text", page: 1, item: items[at]! }))]
    })
  ];
}

/** The trial's summary: both reads' accounts, Core's readings of their values, and the stored rows. */
export function waitlistRunSummary(): AutomationStudioRunResultSummary {
  const set = (datasetId: string, nodeId: string) => ({
    summary: datasetSummary({ runId: "trial.1", datasetId, nodeIds: [nodeId], recordCount: WAITLIST_STORED.length }), schema, rows: WAITLIST_STORED.map((row) => ({ ...row }))
  });
  return summarizeAutomationStudioRunResult({
    recordSets: [set("eligible", WAITLIST_ELIGIBLE_READ), set("approved", WAITLIST_APPROVED_READ)],
    flowNodes: [{ id: "node.waitlist.open", definitionId: "web.output.browser-navigate", parameterValues: { url: "https://makerspace.test/waitlist" } }, ...waitlistReadNodes()],
    actionAttempts: waitlistAttempts(),
    deniedEvidenceKeys: [],
    now: 0
  });
}

/**
 * A yes in the shape of steps 0209 to 0218's: it quotes the request once in a
 * sentence naming each condition and names none of the rows either condition
 * left out.
 */
export const WAITLIST_YES = {
  answersRequest: "yes",
  expected: "Every booking whose member logged at least 3 safety sessions approved, the rest left waiting, and a table of the approved bookings in list order.",
  observed: [
    "The first read kept 3 bookings: its condition 1 (sessions atLeast 3) carries out \"at least 3 safety sessions\", and the rows it alone left out are settled.",
    "The second read's condition 1 (the item's text contains \"Booking approved\") carries out \"every booking the list now shows as approved\", and the rows it alone left out are settled.",
    "Both tables hold the same 3 bookings, in list order, so the result answers the request."
  ].join("\n")
};
