// A made-up library board of reading-circle notices for a no Core's record of
// its rows refutes (t810, framework plan P5b): the shape of run
// `run-mvud43a2-445c7f17`, where a Flow stored exactly the rows asked for and
// every judge called left-out rows missing. Two left-out notices come from
// circles the person is not in -- each item offered the person a "Reserve a
// place" control, which the client marks as `outside` -- and a member's own
// note is given a circle its own `circle` cell does not hold. No task, site,
// item or answer of any realistic scenario.
import type { AutomationStudioFlowInstruction } from "../../../../model/index.ts";
import type { AutomationStudioRunResultSummary } from "../../contracts/index.ts";
import type { AutomationStudioResultItemMark } from "../../read-condition.ts";
import type { AutomationStudioResultVerdictInput } from "../../verdict/index.ts";

type Diagnosis = NonNullable<AutomationStudioResultVerdictInput["diagnosis"]>;

export const CIRCLE_REQUEST = "Go through my library board down to its end and list every notice in it that was written in one of the reading circles I belong to on or after 1 March 2027. "
  + "Leave out every notice that was not written in a circle at all, such as a member's own note, and every notice from a circle I have not entered, such as one offered with a Reserve a place button. "
  + "Give me a table with columns circle, author, posted and text.";

/** The request's words the circle notices are asked for by: first person, nothing negated. */
export const OWN_CIRCLES = "every notice in it that was written in one of the reading circles I belong to on or after 1 March 2027";
/** The request's words for circles the person is not in: negated. */
export const NOT_ENTERED = "every notice from a circle I have not entered";
/** The request's words naming circles with no person in them. */
export const ANY_CIRCLE = "written in one of the reading circles";

export function circleInstruction(): AutomationStudioFlowInstruction {
  return {
    schemaVersion: "0.1", instructionId: "instruction.flow.goal", title: "Circle notices", body: CIRCLE_REQUEST,
    scope: { kind: "flow", projectId: "project-1", flowId: "flow-1" }, priority: 1, status: "active", requirement: "required", createdAt: 1, updatedAt: 1
  };
}

const reserve = (circle: string): AutomationStudioResultItemMark[] => [{ kind: "outside", said: "Reserve a place", entity: circle }];

/** The member's own note, its `circle` cell its author's name, as the board writes such a note. */
export const OWN_NOTE = { circle: "Ann Lee", author: "Ann Lee", posted: "Wednesday 3 March 2027 at 09:15", text: "The east reading room is closed on Friday for new shelving." };

/**
 * The run: two notices of circles the person belongs to stored; condition 1
 * (`access`) alone left out the member's own note, twice (it showed on both
 * pages), and two notices of circles the person is not in, each marked by the
 * client as outside (`leftOutMarks`) unless `marks` is false. The read read
 * every page.
 */
export function circleRunSummary(options: { marks?: boolean } = {}): AutomationStudioRunResultSummary {
  const marks = options.marks !== false;
  const garden = { circle: "Garden Readers", author: "Kai Moss", posted: "Tuesday 2 March 2027 at 18:40", text: "Seed catalogue swap after the Saturday session." };
  const cycle = { circle: "Cycle Readers", author: "Rui Tan", posted: "Monday 1 March 2027 at 07:05", text: "Route maps for the spring reading ride are on the counter." };
  return {
    schemaVersion: "automation-studio.run-result-summary.v1",
    totalRecordCount: 2, totalRefusedCount: 0, totalRowsMissingRequired: 0, recordSetCount: 1,
    recordSets: [{
      datasetId: "circle-notices", recordCount: 2, refusedCount: 0, truncated: false, columns: ["circle", "author", "posted", "text"], columnsWithheld: false,
      rowsChecked: 2, rowsMissingRequired: 0, missingRequiredColumns: [],
      sampleRows: [
        { circle: "Poetry Circle", author: "Dana Ortiz", posted: "Thursday 4 March 2027 at 11:00", text: "Next month's reading is on the shelf by the desk." },
        { circle: "Map Readers", author: "Eli Park", posted: "Tuesday 2 March 2027 at 09:30", text: "Bring a compass to Saturday's session." }
      ]
    }],
    reads: [{
      nodeId: "read-board", definitionId: "example.read-list", pagesRead: 2, stop: "ended", truncated: false, itemsSeen: 6, kept: 2, paginates: true,
      conditions: [
        {
          number: 1, condition: "access startsWith [\"For members of\"]", rejected: 4, alone: 4,
          leftOutOnlyByThis: ["Ann Lee", "Kai Moss", "Rui Tan", "Ann Lee"],
          leftOutCells: [OWN_NOTE, garden, cycle, OWN_NOTE],
          ...(marks ? { leftOutMarks: [null, reserve("Garden Readers"), reserve("Cycle Readers"), null] } : {})
        },
        { number: 2, condition: "posted atLeast 2027-03-01", rejected: 0, alone: 0 }
      ]
    }],
    flowShape: [{ nodeId: "read-board", definitionId: "example.read-list", label: "Read the board" }],
    withheld: false
  };
}

/** The defects of the case's no: two marked notices called missing by their circles, and the member's own note given a circle its cell does not hold. */
export const REFUTED_DEFECTS = [
  { kind: "asked_missing", row: "Ann Lee — circle: Town Archive Society, posted: Wednesday 3 March 2027 at 09:15", column: "circle", value: "Town Archive Society", requestWords: OWN_CIRCLES },
  { kind: "asked_missing", row: "Kai Moss — circle: Garden Readers, posted: Tuesday 2 March 2027 at 18:40", column: "circle", value: "Garden Readers", requestWords: OWN_CIRCLES },
  { kind: "asked_missing", row: "Rui Tan — circle: Cycle Readers, posted: Monday 1 March 2027 at 07:05", column: "circle", value: "Cycle Readers", requestWords: OWN_CIRCLES }
] as const;

/** A no naming only rows Core's record of each refutes (the case's 0063 shape). */
export const REFUTED_NO = {
  answersRequest: "no",
  expected: "Every notice of a circle the person belongs to on or after 1 March 2027.",
  observed: "Only two notices were kept.",
  changed: "Change condition 1 on read-board.",
  defects: REFUTED_DEFECTS.map((defect) => ({ ...defect }))
} satisfies Diagnosis;

/** A yes naming each left-out row with the request's words that leave it out. */
export const CIRCLE_YES = {
  answersRequest: "yes",
  expected: "Every notice of a circle the person belongs to on or after 1 March 2027.",
  observed: "The result holds the Poetry Circle and Map Readers notices. \"Ann Lee\" was left out: it is a member's own note, and the request says \"Leave out every notice that was not written in a circle at all\". \"Kai Moss\" and \"Rui Tan\" were left out: each offered a Reserve a place button, and the request says to leave out \"every notice from a circle I have not entered\".",
  changed: ""
} satisfies Diagnosis;

/**
 * The case's re-ask shape (0065/0066): the two marked notices called missing by
 * the value their condition tested, and the member's own note recast as a
 * wrong value of the result, which never held it.
 */
export const RECAST_NO = {
  answersRequest: "no",
  expected: "Every notice of a circle the person belongs to on or after 1 March 2027.",
  observed: "Condition 1 dropped notices of joined circles, and the kept Ann Lee row has the author in its circle column.",
  changed: "Change condition 1 on read-board and the circle field.",
  defects: [
    { kind: "asked_missing", row: "Kai Moss — circle: Garden Readers, posted: Tuesday 2 March 2027 at 18:40", column: "access", value: "Open to all", requestWords: OWN_CIRCLES },
    { kind: "asked_missing", row: "Rui Tan — circle: Cycle Readers, posted: Monday 1 March 2027 at 07:05", column: "access", value: "Open to all", requestWords: OWN_CIRCLES },
    { kind: "wrong_value", row: "Ann Lee — circle: Town Archive Society, posted: Wednesday 3 March 2027 at 09:15", column: "circle", value: "Ann Lee", requestWords: "Give me a table with columns circle, author, posted and text" }
  ]
} satisfies Diagnosis;

/** A yes as `CIRCLE_YES`, citing the stored cells it checked (`diagnosis.checked`); `author` the author it cites for the Poetry Circle notice. */
export function citingYes(author: string): Diagnosis {
  return { ...CIRCLE_YES, checked: [{ row: "Poetry Circle", column: "author", value: author }, { row: "Map Readers", column: "circle", value: "Map Readers" }] };
}
