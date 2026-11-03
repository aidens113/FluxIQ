// The step a refusal is about, read from where it was refused.
//
// Every check after authoring refuses at a path: assembly at a script line
// (`flow.line.<N>`) or a node it built, the domain at a node's parameters,
// registry validation at a node, an edge, a Subflow or a router rule, the
// candidate's binding checks at a node's parameter. Each of those is looked up
// in the locator the acceptance carries (`./script-locator.ts`,
// `./plan-locator.ts`), and the answer is the step as the model wrote it: its
// description, its label, and the line. A path the locator cannot place -- the
// whole Flow, the wrapper, a limit -- is about no one step, and has no place.
import type { AutomationStudioFlowBootstrapIssueLocator, AutomationStudioFlowScriptPlace } from "./contracts.ts";

const SCRIPT_LINE = /^flow\.line\.(\d+)$/u;
const NODE = /^plan\.subflows\.(\d+)\.nodes\.(\d+)(?:\.|$)/u;
const EDGE = /^plan\.subflows\.(\d+)\.edges\.(\d+)(?:\.|$)/u;
const SUBFLOW = /^plan\.subflows\.(\d+)(?:\.|$)/u;
const RULE = /^plan\.router\.rules\.(\d+)(?:\.|$)/u;
const FALLBACK = /^plan\.router\.fallback(?:\.|$)/u;

/**
 * Where the issue at `path` is in what the model wrote, or nothing when it is
 * about no one step. For a script line the line is that line; for anything
 * built from a step, the step's own `step:` line.
 */
export function automationStudioFlowBootstrapIssuePlace(
  locator: AutomationStudioFlowBootstrapIssueLocator | undefined,
  path: string | undefined
): AutomationStudioFlowScriptPlace | undefined {
  if (!locator || !path) return undefined;
  const exact = locator.paths[path];
  if (exact) return { ...exact };
  const line = SCRIPT_LINE.exec(path);
  if (line) return linePlace(locator, Number(line[1]));
  const node = NODE.exec(path);
  if (node) return copy(locator.nodes[`${node[1]}.${node[2]}`]);
  const edge = EDGE.exec(path);
  if (edge) return copy(locator.edges[`${edge[1]}.${edge[2]}`]);
  const subflow = SUBFLOW.exec(path);
  if (subflow) return copy(locator.subflows[subflow[1]!]);
  const rule = RULE.exec(path);
  if (rule) return copy(locator.rules[rule[1]!]);
  if (FALLBACK.test(path)) return copy(locator.fallback);
  return undefined;
}

/**
 * The step a script line is in: a block's own line exactly, else the step
 * written last at or before it. A line before every step is placed at the
 * first one, so no line a refusal names is left without a step.
 */
function linePlace(locator: AutomationStudioFlowBootstrapIssueLocator, line: number): AutomationStudioFlowScriptPlace | undefined {
  if (line <= 0) return undefined;
  const exact = locator.lines.find((entry) => entry.exact && entry.line === line);
  if (exact) return { ...exact.place, line };
  const steps = locator.lines.filter((entry) => !entry.exact);
  const containing = [...steps].reverse().find((entry) => entry.line <= line) ?? steps[0];
  return containing ? { ...containing.place, line } : undefined;
}

function copy(place: AutomationStudioFlowScriptPlace | undefined): AutomationStudioFlowScriptPlace | undefined {
  return place ? { ...place } : undefined;
}
