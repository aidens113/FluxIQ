// A Flow router's routes, stored beside the graph rather than as a node, as
// the arms of a first step (rule 2): each active rule, in its order, runs its
// Subflow; the fallback is "Otherwise:".
import type { FlowOutlineOptions, OutlineLink, OutlineStep } from "../types/index.ts";

/** The router's step, or nothing when it routes nowhere. */
export function outlineRouterStep(options: FlowOutlineOptions): OutlineStep | undefined {
  const router = options.router;
  if (!router) return undefined;
  const run = (subflowId: string): OutlineStep => {
    const link: OutlineLink = { kind: "subflow", id: subflowId };
    const callee = options.describeFlow?.(link);
    return { number: "", nodeIds: [], kind: "call", words: `Run Flow ▸ ${callee?.name.trim() || "another part of this Flow"}`, lasting: [...(callee?.lastingClasses ?? [])], link };
  };
  const arms = router.rules
    .filter((rule) => rule.status === "active")
    .sort((a, b) => a.order - b.order)
    .map((rule) => ({ words: `When “${rule.name}” applies:`, port: rule.ruleId, steps: [run(rule.target.subflowId)] }));
  const fallback = router.fallback;
  if (fallback?.kind === "subflow") arms.push({ words: "Otherwise:", port: "fallback", steps: [run(fallback.subflowId)] });
  else if (fallback) arms.push({ words: "Otherwise:", port: "fallback", steps: [{ number: "", nodeIds: [], kind: "end", words: "Stop here: no route fits", lasting: [] }] });
  return arms.length ? { number: "", nodeIds: [], kind: "router", words: "Choose which part runs:", lasting: [], arms } : undefined;
}
