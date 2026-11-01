import type { AutomationStudioFlowInstruction } from "../../../../model/index.ts";
import type { AutomationStudioLlmVerificationDefect } from "../../../llm/index.ts";
import type { AutomationStudioRunResultSummary } from "../../contracts/index.ts";
import { automationStudioRequestWording } from "../../request-rows/index.ts";
import { automationStudioResultVerdict } from "../../verdict/index.ts";
import type { AutomationStudioResultVerificationReport } from "../../verify.ts";
import { automationStudioResultVerificationAgreement, automationStudioResultVerificationNoRecord, automationStudioResultVerificationReaskUnsupportedNo } from "../../agreement/index.ts";

const instruction: AutomationStudioFlowInstruction = {
  schemaVersion: "0.1", instructionId: "instruction.goal", title: "Goal", body: "List every workshop marked open, with its name and status.",
  scope: { kind: "flow", projectId: "project", flowId: "flow" }, priority: 1, status: "active", requirement: "required", createdAt: 1, updatedAt: 1
};

/** Entirely invented unit-test evidence; no realistic site/task or provider is used. */
export const inspectionFixture = {
  instruction,
  defect(): AutomationStudioLlmVerificationDefect {
    return { kind: "asked_missing", row: "Amber workshop", column: "status", value: "Open", requestWords: "every workshop marked open", step: "read" };
  },
  summary(measured?: string): AutomationStudioRunResultSummary {
    return {
      schemaVersion: "automation-studio.run-result-summary.v1", totalRecordCount: 0, totalRefusedCount: 0, totalRowsMissingRequired: 0, recordSetCount: 0, recordSets: [], withheld: false,
      flowShape: [{ nodeId: "read", definitionId: "list.read" }],
      reads: [{ nodeId: "read", definitionId: "extract_list", pagesRead: 1, truncated: false, itemsSeen: 2, kept: 1, conditions: [{ number: 1, condition: "status", rejected: 1, alone: 1, leftOutOnlyByThis: ["Amber workshop"], ...(measured === undefined ? {} : { leftOutCells: [{ status: measured }] }) }] }],
      buildTest: {
        kind: "build_test", test: "ran",
        steps: [{ step: 1, action: "read", outcome: "replayed", observed: { readRows: { rows: ["Cedar workshop"], leftOutOnlyByThis: [{ number: 1, condition: "status", rows: ["Amber workshop"] }] } } }],
        stores: [{ dataset: "answer", writeMode: "append", steps: [1], passes: 1, collected: 1, answer: { rows: 1, labels: ["Cedar workshop"] }, removed: { duplicates: 0, filteredOut: 0, cut: 0 } }]
      }
    };
  },
  async report(summary: AutomationStudioRunResultSummary, defects: AutomationStudioLlmVerificationDefect[] = [inspectionFixture.defect()]): Promise<AutomationStudioResultVerificationReport> {
    const instructions = [instruction];
    const requestText = `${instruction.title}\n${instruction.body}`;
    const wording = automationStudioRequestWording(instructions, summary);
    const one = automationStudioResultVerdict({ summary, basis: "model", wording, diagnosis: { answersRequest: "no", expected: instruction.body, observed: "The answer lacks a row whose status is open.", changed: "Remove the status condition without checking it.", stillAchievable: "yes", defects } });
    const input = { first: one, second: one, confirmAnswer: true, summary, reads: summary.reads, recordSets: summary.recordSets, wording, requestText };
    const settled = automationStudioResultVerificationAgreement(input);
    const outcome = await automationStudioResultVerificationReaskUnsupportedNo({ settled, calls: [one, one], record: automationStudioResultVerificationNoRecord(input), summary, requestText, ask: async () => one, agree: (first, second) => automationStudioResultVerificationAgreement({ ...input, first, second }) });
    return { outcome: { ...outcome, performed: true }, interventions: [] };
  }
};
