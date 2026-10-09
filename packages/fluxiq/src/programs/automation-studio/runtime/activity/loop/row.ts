import { automationStudioActivityHumanLabel } from "../wording/index.ts";
import type { AutomationStudioActivityLoop, AutomationStudioActivityLoopPass } from "./types.ts";

/** What the stream reads of a run's attempts: which node ran, how it left, and what it output. */
type Attempt = { nodeId: string; route?: string | undefined; outputs: Readonly<Record<string, unknown>> };

/** The most of a row's name a card carries, as a test's pass carries it (`../call-context.ts`). */
const MAX_ROW_NAME = 40;
/** A field whose value is an address is never the row's name. */
const ADDRESS = /^[a-z][a-z0-9+.-]*:\/\//iu;

/**
 * A row as a person reads it: the row itself when it is text, else its first
 * field holding words that are not an address -- the extraction's first column
 * ("Jonas Weber"), not its link. Nothing for a row with no such field.
 */
function rowName(item: unknown): string | undefined {
  const named = (value: unknown): string | undefined => (typeof value === "string" && !ADDRESS.test(value.trim())
    ? automationStudioActivityHumanLabel(value.replace(/[“”]/gu, ""), MAX_ROW_NAME)
    : undefined);
  if (typeof item === "string") return named(item);
  if (!item || typeof item !== "object" || Array.isArray(item)) return undefined;
  for (const value of Object.values(item)) {
    const name = named(value);
    if (name !== undefined) return name;
  }
  return undefined;
}

/**
 * The row a node runs on: the item the list loop's For Each handed its pass
 * (`nodes/control-flow/for-each.ts`, `item` and `index` on the `body` route),
 * for a node that loop's pass runs. For loops one inside another, the loop
 * whose pass began last. Undefined for a node in no list loop, one whose loop
 * has begun no pass, or a row with no name a person reads (t378, lane D: every
 * pass read "Click · Confirm", and a refused press and its retry could not be
 * told apart from the next row's).
 */
export function automationStudioActivityLoopRow(loops: readonly AutomationStudioActivityLoop[], attempts: readonly Attempt[], nodeId: string): (AutomationStudioActivityLoopPass & { row: string }) | undefined {
  let found: { at: number; pass: AutomationStudioActivityLoopPass & { row: string } } | undefined;
  for (const loop of loops) {
    if (!loop.members.has(nodeId)) continue;
    let at = attempts.length - 1;
    while (at >= 0 && !(attempts[at]!.nodeId === loop.repeatId && attempts[at]!.route === "body")) at -= 1;
    if (at < 0 || (found && at <= found.at)) continue;
    const { index, item } = attempts[at]!.outputs;
    const row = rowName(item);
    if (row === undefined || typeof index !== "number" || !Number.isSafeInteger(index) || index < 0) continue;
    found = { at, pass: { repeatId: loop.repeatId, pass: index + 1, unit: "row", row } };
  }
  return found?.pass;
}
