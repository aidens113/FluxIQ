// A made-up library account for a no of a result that stores no rows (t766): a
// request to turn on due-date reminders and have them arrive two days before a
// book is due, and a Flow that opened the account's settings and switched the
// reminders on, but never chose when they arrive. It stored nothing: the result
// is what its steps did. No task, site, item or answer of any realistic scenario.
import type { AutomationStudioFlowInstruction } from "../../../../model/index.ts";
import type { AutomationStudioRunResultSummary } from "../../contracts/index.ts";

/** The request: two acts, one switch and one choice. */
export const REMINDER_REQUEST = "Open my library account's settings, turn on due-date reminders, and have them arrive two days before a book is due.";

/** The request as a Flow's instruction states it. */
export function reminderInstruction(): AutomationStudioFlowInstruction {
  return {
    schemaVersion: "0.1", instructionId: "instruction.flow.goal", title: "Due-date reminders", body: REMINDER_REQUEST,
    scope: { kind: "flow", projectId: "project-1", flowId: "flow-1" }, priority: 1, status: "active", requirement: "required", createdAt: 1, updatedAt: 1
  };
}

/** What the run did: it opened the settings and switched the reminders on, each step with the change the run saw it make. */
export function reminderRunSummary(extra: Partial<AutomationStudioRunResultSummary> = {}): AutomationStudioRunResultSummary {
  return {
    schemaVersion: "automation-studio.run-result-summary.v1",
    totalRecordCount: 0,
    totalRefusedCount: 0,
    totalRowsMissingRequired: 0,
    recordSetCount: 0,
    recordSets: [],
    flowShape: [
      { nodeId: "open-settings", definitionId: "example.press", label: "Open account settings", parameters: { control: "Account settings" }, changed: [{ added: "heading \"Account settings\"" }] },
      { nodeId: "switch-reminders", definitionId: "example.press", label: "Turn on reminders", parameters: { control: "Due-date reminders" }, changed: [{ added: "switch \"Due-date reminders\" on", removed: "switch \"Due-date reminders\" off" }] }
    ],
    endView: { after: "switch-reminders", view: { page: "PAGE \"Account settings\"\nswitch \"Due-date reminders\" on\nfield \"Send reminders\" =\"On the due date\"" } },
    withheld: false,
    ...extra
  };
}

/** A no naming the choice no step made, by what it is done to, quoting the request. */
export const REMINDER_MISSING_NO = {
  answersRequest: "no",
  observed: "The reminders were switched on, but no step sets when they arrive: the page still says On the due date.",
  changed: "Choose two days before in the Send reminders field.",
  defects: [{ kind: "act_missing", row: "Send reminders: two days before", requestWords: "have them arrive two days before a book is due" }]
};

/** A no naming the step that switched the reminders, saying its act left them arriving on the wrong day. */
export const REMINDER_WRONG_NO = {
  answersRequest: "no",
  observed: "Step switch-reminders switched the reminders on, but they still arrive on the due date.",
  changed: "After switching them on, choose two days before.",
  defects: [{ kind: "act_wrong", step: "switch-reminders", row: "Due-date reminders", requestWords: "have them arrive two days before a book is due" }]
};

/** A no that names its requirement only as `other`: nothing Core can find, so it stays unsure. */
export const REMINDER_OTHER_NO = {
  answersRequest: "no",
  observed: "The reminders do not arrive two days before.",
  changed: "Choose two days before.",
  defects: [{ kind: "other", row: "reminder timing", requestWords: "have them arrive two days before a book is due" }]
};
