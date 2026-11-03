import type { AutomationStudioRunResultSummary } from "../contracts/index.ts";
import { automationStudioResultWitnessMove } from "./witness-move.ts";

type SiteChange = NonNullable<AutomationStudioRunResultSummary["siteChange"]>;

/**
 * Each change part shown by the trial whose change Core can read at a place
 * as a whole move other than the count it asks (t775): a part asking to add 1
 * where a list's one changed row read 9 before and 11 after moved by 2. With
 * the part, Core's words for it. A `count` of `each_match` is never read, nor
 * a place whose move Core cannot read (`./witness-move.ts`) or where no row's
 * quantity moved (rows added or removed alone are the judge's), nor a place that
 * shows the change of another change part as well: its move cannot be split
 * between them. Those are left to the judge.
 */
export function automationStudioResultChangeCountDiffers(siteChange: SiteChange | undefined): Array<{ part: string; said: string }> {
  if (!siteChange) return [];
  const changeParts = new Set(siteChange.proofs.filter((proof) => proof.effect.kind === "change").map((proof) => proof.part));
  const differs: Array<{ part: string; said: string }> = [];
  for (const proof of siteChange.proofs) {
    const effect = proof.effect;
    if (proof.proof !== "shown" || effect.kind !== "change" || typeof effect.count !== "number") continue;
    const asked = (effect.direction === "adds" ? 1 : -1) * effect.count;
    const places: string[] = [];
    for (const witness of siteChange.witnesses) {
      if (!witness.parts.includes(proof.part) || witness.parts.some((part) => part !== proof.part && changeParts.has(part))) continue;
      const move = automationStudioResultWitnessMove(witness);
      // Held only where a row's quantity moved: rows added or removed alone can mislead (a new row holding more than one, rows keyed by text carrying the quantity), so they stay the judge's.
      if (!move || !move.moves.length || move.total === asked) continue;
      places.push(`at ${witness.where ? `"${witness.where}"` : `place ${witness.id}`} ${move.words}, a move of ${move.total} where it asks for ${asked}`);
    }
    if (places.length) differs.push({ part: proof.part, said: `it ${effect.direction} ${effect.count} ${effect.what}, and Core read ${places.join("; ")}` });
  }
  return differs;
}
