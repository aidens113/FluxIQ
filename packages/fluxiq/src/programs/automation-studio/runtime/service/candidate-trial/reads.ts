// What each list read of a trial saw and kept, for the model (t466).
//
// Lane D round 8 (`run-mv5jnc5m-a47c3e59`, revs 3 and 5): a listing whose two
// `where` entries were both required kept 0 of 8 rows, so the loop over it ran
// no passes. The model was told only that the Flow's connections were wrong,
// twice, and spent about $0.0125 and two trials before it found that it had
// written two required conditions where it meant one that accepts either form.
// Each read now says how many rows it saw, how many it kept, and what each of
// its conditions rejected -- the read account the judge is already shown
// (`../../result-verification/read-account/`) -- and a read that kept none says
// that no rows kept is a valid outcome when no row matches, and that its
// conditions must all hold.
//
// Only counts and the conditions in the model's own wording, as the read
// account screened them; never the rows a condition left out, which are page
// values.
//
// **Under every verdict (t474).** Lane D round 9 (`run-mv5q4j2n-25784472`)
// lost seven trials to a listing that kept 0 of 8 rows, each failed before a
// judge was asked; the feedback of a run that did not reach its end carried
// no reads at all. A judged trial takes its reads from the judge's summary, an
// execution-failed one from the run's own read accounts (`./run.ts`), and both
// are said here the same way.
//
// **And the steps that acted on the page before it (t482).** A judged trial's
// read names them (`narrowedBefore`, `../../result-verification/`
// `narrowed-before.ts`): their label, the words of the control they pressed or
// chose, and whether they went to another page. Lane C round 12
// (`run-mv62icw3-9118516f`) built a Flow whose site filter kept less than the
// request asked before its read, and neither the judges nor the model could see
// the rows it removed. `beforeRead` says once what such a step means for the
// read. An execution-failed trial's reads come from the run record alone and
// carry none.

//
// **And Core's flag on a read that kept every item it saw after an act over a
// narrower read of the same list (t692)**, as the read account carries it
// (`keptEveryRow`): node ids, counts and Core's sentence, never a row. The
// builder reads why its last read is in doubt, and a single-subflow plan's
// whole test carries it to the builder's gate from here
// (`../../project-agents/single-subflow/single-subflow-trial.ts`).
import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioFlowArtifact } from "../../../model/index.ts";
import { automationStudioResultConditionName, type AutomationStudioResultReadAccount } from "../../result-verification/index.ts";

/** What a read's `narrowedBefore` means for it, said to the model once per read that carries one (header). */
const BEFORE_READ = "These steps acted on the page before this read ran. Rows a step removed on the site (a search, a filter, a category, a sort, an option chosen) never reached the read, so no condition's count shows them. A step whose words keep less than the request asks leaves asked rows out; remove it, or keep exactly the request's terms with a condition on the read.";

/** Each read the trial made: what it saw, kept and rejected, and Core's sentence for it. */
export function automationStudioTrialReadsFeedback(reads: readonly AutomationStudioResultReadAccount[] | undefined, graph: AutomationStudioFlowArtifact | undefined): JsonObject[] {
  const labels = new Map((graph?.nodes ?? []).map((node) => [node.id, node.label]));
  return (reads ?? []).map((read) => {
    const conditions = (read.conditions ?? []).map((condition, index) => ({
      condition: automationStudioResultConditionName(condition.number ?? index + 1, condition.condition),
      ...(condition.rejected !== undefined ? { rejected: condition.rejected } : {}),
      ...(condition.alone !== undefined ? { rejectedByItself: condition.alone } : {})
    }));
    const label = labels.get(read.nodeId);
    return {
      nodeId: read.nodeId,
      ...(label ? { label } : {}),
      ...(read.itemsSeen !== undefined ? { seen: read.itemsSeen } : {}),
      kept: read.kept,
      ...(conditions.length ? { conditions } : {}),
      ...(read.unfiltered ? { unfiltered: true } : {}),
      said: said(read, conditions),
      ...(read.narrowedBefore?.length ? { narrowedBefore: read.narrowedBefore.map((step) => ({ ...step })), beforeRead: BEFORE_READ } : {}),
      // Core's flag on a read that kept every item it saw after an act over a narrower read of the same list (t692).
      ...(read.keptEveryRow ? { keptEveryRow: structuredClone(read.keptEveryRow) } : {})
    };
  });
}

function said(read: AutomationStudioResultReadAccount, conditions: ReadonlyArray<{ condition: string; rejected?: number }>): string {
  const seen = read.itemsSeen !== undefined ? `saw ${read.itemsSeen} ${read.itemsSeen === 1 ? "row" : "rows"} and ` : "";
  const kept = read.kept === 0 ? "kept none" : `kept ${read.kept}`;
  const each = conditions.map((condition) => `${condition.condition} rejected ${condition.rejected ?? "an unreported number of"}`).join("; ");
  const rule = conditions.length > 1
    ? `A row is kept only when it passes every one of its ${conditions.length} conditions (a row can fail more than one): ${each}.`
    : conditions.length ? `Its condition ${each}.` : "";
  const head = `The read ${seen}${kept}.${rule ? ` ${rule}` : ""}`;
  if (read.unfiltered) return `${head} Every row failed its conditions, so it answered with the unfiltered rows.`;
  if (read.kept > 0 || !conditions.length) return head;
  return `${head} Keeping no rows is a valid outcome when no row on the page matches, and a loop over the kept rows then runs no passes; it is not a fault in the Flow's connections. If the request wants some of these rows, a condition is wrong: check each against the request's own words. Conditions that should accept a row in any of several forms must be one condition that names the forms together, not separate conditions that must all hold.`;
}
