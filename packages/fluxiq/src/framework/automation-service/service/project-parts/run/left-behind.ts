// A row a page-level link left behind, as a part's run keeps it (t869; the Flow's version is
// `service/answer-first/run-acts/run-gate.ts`, and the forward run's `S/runtime/llm/node-tools/replay/span.ts`).
//
// The page says when a step's press went as a link that is not shown to be the pass's row's own
// (`resolution.passRow: "page-level-link"`, written by the web domain's resolver). From there nothing
// says the page is still on that row, so the pass's next lasting step must not land: the gate
// (`./step-gate.ts`) stops the run before it, and nothing is sent. A step that answers it found its
// row (`own`) takes this back, and so does a pass of another row. Steps that declare nothing lasting
// run as they always did.
//
// It reads each answer where the step's answer may hold it: the dispatch's, and a step run at its
// own door. In memory, for one run.
import type { JsonValue } from "../../../../../core/index.ts";
import type { AutomationNodeExecutionResult } from "../../../../../components/automation/index.ts";

export type ProjectPartLeftBehind = {
  /** The row the step about to run is handed (`undefined` for a step with none). */
  passing(row: JsonValue | undefined): void;
  /** What a step answered; its resolution may say how it found its row. */
  answered(answer: AutomationNodeExecutionResult | undefined): void;
  /** Whether a link left this row behind, with no step since finding it again: `row` as a step's gate saw it, or the pass in hand when none was seen. */
  stands(row?: JsonValue | undefined): boolean;
};

const PAGE_LEVEL_LINK = "page-level-link";
const OWN = "own";

export function projectPartLeftBehind(): ProjectPartLeftBehind {
  let passing: string | undefined;
  let behind: string | undefined;
  return {
    passing: (row) => {
      passing = row === undefined || row === null ? undefined : JSON.stringify(row);
    },
    answered: (answer) => {
      const said = passRowOf(answer);
      if (said === PAGE_LEVEL_LINK) behind = passing;
      else if (said === OWN) behind = undefined;
    },
    stands: (row) => behind !== undefined && behind === (row === undefined ? passing : JSON.stringify(row))
  };
}

/** The closed word an answer carries of a pass's row (`domain/src/actions/types.ts`), wherever the answer holds its resolution. */
function passRowOf(answer: AutomationNodeExecutionResult | undefined): unknown {
  const result = recordOf(answer?.outputs?.result);
  return (recordOf(result?.resolution) ?? recordOf(recordOf(result?.result)?.resolution))?.passRow;
}

function recordOf(value: JsonValue | undefined): Record<string, JsonValue> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value : undefined;
}
