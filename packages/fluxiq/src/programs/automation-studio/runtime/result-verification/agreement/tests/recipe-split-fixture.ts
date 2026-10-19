// A made-up recipe archive for the re-ask of a split's no (t725): a request for
// every soup in one section, a read that stored exactly the soups asked for,
// a yes, a no whose only objection is a row it grants was rightly left out
// and a section this run never showed, and a no that names a real defect.
// No task, site, item or answer of any realistic scenario.
import type { AutomationStudioFlowInstruction } from "../../../../model/index.ts";
import type { AutomationStudioRunResultSummary } from "../../contracts/index.ts";

/** The request: one section, two columns, one stated exclusion. */
export const RECIPE_REQUEST = "Open the archive's Soups section and collect every soup recipe there with its title and cooking time, leaving out recipes marked members only.";

/** The soups the read kept and the run stored. */
export const RECIPE_KEPT = ["Leek and Potato Soup", "Roasted Tomato Soup", "Spiced Lentil Soup"];

/** The request as a Flow's instruction states it. */
export function recipeInstruction(): AutomationStudioFlowInstruction {
  return {
    schemaVersion: "0.1", instructionId: "instruction.flow.goal", title: "Collect the soups", body: RECIPE_REQUEST,
    scope: { kind: "flow", projectId: "project-1", flowId: "flow-1" }, priority: 1, status: "active", requirement: "required", createdAt: 1, updatedAt: 1
  };
}

/** The run: three soups stored, every one the read saw. */
export function recipeRunSummary(): AutomationStudioRunResultSummary {
  return {
    schemaVersion: "automation-studio.run-result-summary.v1",
    totalRecordCount: 3,
    totalRefusedCount: 0,
    totalRowsMissingRequired: 0,
    recordSetCount: 1,
    recordSets: [{
      datasetId: "soups", recordCount: 3, refusedCount: 0, truncated: false, columns: ["title", "cookingTime"], columnsWithheld: false,
      rowsChecked: 3, rowsMissingRequired: 0, missingRequiredColumns: [],
      sampleRows: RECIPE_KEPT.map((title, index) => ({ title, cookingTime: `${30 + index * 5} min` }))
    }],
    reads: [{ nodeId: "read", definitionId: "extract_list", pagesRead: 1, truncated: false, itemsSeen: 3, kept: 3 }],
    flowShape: [{ nodeId: "open", definitionId: "click" }, { nodeId: "read", definitionId: "extract_list" }],
    withheld: false
  };
}

/** The yes: every soup asked for is stored, with both columns. */
export const RECIPE_YES = { answersRequest: "yes", expected: "Every soup in the Soups section, with title and cooking time.", observed: "Three soups are stored, each with its title and cooking time." };

/** The no whose only objections are a row it grants is rightly out and a section this run never showed. */
export const RECIPE_HYPOTHETICAL_NO = {
  answersRequest: "no",
  expected: "Every soup in the Soups section, with title and cooking time.",
  observed: "The three stored soups are right, with their titles and cooking times. A members-only recipe is not stored, which is correct. But a soup filed in another section would be dropped by this read.",
  changed: "Read every section of the archive so a soup filed elsewhere is kept too."
};

/** A no naming a real defect: a stored value is wrong, quoting the request. */
export const RECIPE_DEFECT_NO = {
  answersRequest: "no",
  expected: "Every soup with its cooking time, as the request says \"with its title and cooking time\".",
  observed: "The cookingTime of Spiced Lentil Soup is stored as 40 min, but its recipe card says 55 min.",
  changed: "Read the cooking time from the recipe card's own time field."
};
