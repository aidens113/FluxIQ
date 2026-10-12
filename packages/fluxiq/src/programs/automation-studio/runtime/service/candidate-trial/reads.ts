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

import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioFlowArtifact } from "../../../model/index.ts";
import type { AutomationStudioResultReadAccount } from "../../result-verification/index.ts";

/** Each read the trial made: what it saw, kept and rejected, and Core's sentence for it. */
export function automationStudioTrialReadsFeedback(reads: readonly AutomationStudioResultReadAccount[] | undefined, graph: AutomationStudioFlowArtifact | undefined): JsonObject[] {
  const labels = new Map((graph?.nodes ?? []).map((node) => [node.id, node.label]));
  return (reads ?? []).map((read) => {
    const conditions = (read.conditions ?? []).map((condition, index) => ({
      condition: condition.condition ?? `condition ${index + 1} (wording withheld)`,
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
      said: said(read, conditions)
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
