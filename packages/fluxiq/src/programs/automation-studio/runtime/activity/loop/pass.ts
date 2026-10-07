import type { AutomationStudioActivityLoop, AutomationStudioActivityLoopPass } from "./types.ts";

/** What the stream reads of a run's attempts: which node ran, how it left, and what it output. */
type Attempt = { nodeId: string; route?: string | undefined; outputs: Readonly<Record<string, unknown>> };

/**
 * The pass a node runs as: the number the loop's Repeat gave the pass it last
 * began (its `pass` output on the `body` route). For a node in loops one
 * inside another, the loop whose pass began last. Undefined for a node in no
 * loop, or one whose loop has begun no pass.
 */
export function automationStudioActivityLoopPass(loops: readonly AutomationStudioActivityLoop[], attempts: readonly Attempt[], nodeId: string): AutomationStudioActivityLoopPass | undefined {
  let found: { at: number; pass: AutomationStudioActivityLoopPass } | undefined;
  for (const loop of loops) {
    if (!loop.members.has(nodeId)) continue;
    let at = attempts.length - 1;
    while (at >= 0 && !(attempts[at]!.nodeId === loop.repeatId && attempts[at]!.route === "body")) at -= 1;
    const pass = at < 0 ? undefined : attempts[at]!.outputs.pass;
    if (typeof pass !== "number" || !Number.isSafeInteger(pass) || pass < 1) continue;
    if (!found || at > found.at) found = { at, pass: { repeatId: loop.repeatId, pass, unit: loop.unit } };
  }
  return found?.pass;
}
