import { emitAutomationStudioActivity } from "../emit.ts";
import { automationStudioActivityLoopPass } from "./pass.ts";
import type { AutomationStudioActivityLoop } from "./types.ts";

type Attempt = { nodeId: string; status: string; route?: string | undefined; outputs: Readonly<Record<string, unknown>> };
type Edge = { sourceNodeId: string; targetNodeId: string; sourcePortId?: string | undefined };

const counted = (count: number, unit: "page" | "pass"): string => `${count} ${unit === "pass" ? (count === 1 ? "pass" : "passes") : (count === 1 ? "page" : "pages")}`;

/**
 * Says once that a do-while loop ended, from the attempt that ended it, read
 * after the attempt is recorded (`attempts` holds it):
 *
 * - a pass's step that succeeded on a route leading only out of the loop (the
 *   last step's `ended`: Next found no further page) -- "The list ended after
 *   5 pages", or for a loop that reads no list "The loop ended after 5 passes";
 * - the Repeat leaving on `done` at its bound -- "The loop stopped at its most
 *   passes (50 pages)".
 *
 * Any other attempt says nothing. The row is a `note` on the Repeat, with the
 * `Node:` record a step row carries, so a card reads it as the loop's own.
 */
export function emitAutomationStudioActivityLoopEnded(input: { loops: readonly AutomationStudioActivityLoop[]; edges: readonly Edge[]; attempts: readonly Attempt[]; attempt: Attempt }): void {
  const { attempt } = input;
  if (attempt.status !== "succeeded" || attempt.route === undefined) return;
  const head = input.loops.find((loop) => loop.repeatId === attempt.nodeId);
  if (head) {
    const most = attempt.outputs.pass;
    if (attempt.route === "done" && typeof most === "number") say(head.repeatId, `The loop stopped at its most passes (${counted(most, head.unit)})`);
    return;
  }
  const pass = automationStudioActivityLoopPass(input.loops, input.attempts, attempt.nodeId);
  const loop = pass && input.loops.find((candidate) => candidate.repeatId === pass.repeatId);
  if (!pass || !loop) return;
  const targets = input.edges.filter((edge) => edge.sourceNodeId === attempt.nodeId && edge.sourcePortId === attempt.route).map((edge) => edge.targetNodeId);
  if (!targets.length || targets.some((target) => target === loop.repeatId || loop.members.has(target))) return;
  say(loop.repeatId, loop.unit === "page" ? `The list ended after ${counted(pass.pass, "page")}` : `The loop ended after ${counted(pass.pass, "pass")}`);
}

function say(repeatId: string, sentence: string): void {
  emitAutomationStudioActivity({
    phase: "running",
    label: sentence,
    detail: { kind: "note", title: sentence, status: "succeeded", ref: repeatId, text: "Node: builtin.control.repeat" }
  });
}
