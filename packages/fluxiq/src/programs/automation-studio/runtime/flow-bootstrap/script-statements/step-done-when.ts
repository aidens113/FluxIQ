// A step's own `done when:` (t413): what the page shows once that one step
// worked, so an act whose answer was lost is settled from the page.
//
//   step add: put the booking on hold
//     done when: text t9 contains "On hold"
//     node: web.dom.click
//     target: t8
//     consequences: create_new
//
// The lines are the facts a handler's and a part's `done when:` are
// (`./fact-condition.ts`): handles, `at "<locator>"`, dialog facts. They
// become the node's expected state, `{ facts: [...] }`
// (`AUTOMATION_STUDIO_EXPECTED_STATE_FACTS_KEY`), which the executor reads
// through the batched fact check (C9) in both places a node's expected state
// is read: the transition comparison after each attempt, and the effect check
// a lasting act whose outcome is unknown gets before anything could make it
// again (`../../executor/transition-comparison.ts`). Which line is a step's,
// and which the block's, is the reader's (`../authoring/parse.ts`).
//
// Refused at the line it is written on: a step that does not act -- one whose
// node reads, waits or checks, a Core node that runs nothing on the page, a
// call to a part, which the part's own `done when:` proves -- has no act to
// settle; a node that cannot hold an expected state has nowhere to keep it;
// and a step that also writes its expected state by hand says it twice.
import type { JsonValue } from "../../../../../core/index.ts";
import type { AutomationStudioNodeDefinition } from "../../../nodes/index.ts";
import { AUTOMATION_STUDIO_EXPECTED_STATE_FACTS_KEY } from "../../executor/defensive/index.ts";
import type { AutomationStudioFlowScriptStep } from "../authoring/index.ts";
import type { AutomationStudioFlowBootstrapIssue } from "../plan/index.ts";
import { automationStudioFlowScriptFacts } from "./fact-condition.ts";
import { scriptStatementRefusal } from "./statement-refusal.ts";

/** The parameter a node keeps what it is meant to leave the page showing in. */
const EXPECTED_STATE_PARAMETER = "expectedState";
/** Core's own nodes that act outside the run: a Run Output dispatches a domain's output, a database node writes. */
const CORE_ACTING_NODE = /^builtin\.(?:policy\.action$|database\.)/u;

/**
 * The parameters the step's other lines set (`written`), with its `done
 * when:` lines as the node's expected state; as they were when it wrote none
 * or was refused. Each refusal is pushed onto `issues`, at the line it is about.
 */
export function automationStudioFlowScriptWithStepDoneWhen(input: {
  step: AutomationStudioFlowScriptStep;
  definition: AutomationStudioNodeDefinition;
  written: Record<string, JsonValue>;
  issues: AutomationStudioFlowBootstrapIssue[];
}): Record<string, JsonValue> {
  const done = input.step.done ?? [];
  const first = done[0];
  if (!first) return input.written;
  const at = `The \`done when:\` at line ${first.line}`;
  const refused = (message: string) => {
    input.issues.push(scriptStatementRefusal("flow_script.fact_invalid", message, first.line));
    return input.written;
  };
  if (input.step.calls !== undefined || !stepActs(input.definition)) {
    return refused(input.step.calls !== undefined
      ? `${at} is on a step that calls a part. The part says what proves it: write the \`done when:\` in the part, after its steps.`
      : `${at} is on a step that does not act ("${input.definition.id}" reads, waits or checks the page), so there is no act whose outcome it could settle. Put it on the step that presses, submits or chooses.`);
  }
  if (!input.definition.parameters.some((parameter) => parameter.id === EXPECTED_STATE_PARAMETER)) {
    return refused(`${at} is on a step whose node ("${input.definition.id}") cannot hold what the page should show after it. Put it on a step whose node acts on the page.`);
  }
  if (input.written[EXPECTED_STATE_PARAMETER] !== undefined) {
    return refused(`${at} is on a step that also writes its expected state. Say it once, as \`done when:\` lines.`);
  }
  const facts = automationStudioFlowScriptFacts(done, input.issues);
  return facts?.length ? { ...input.written, [EXPECTED_STATE_PARAMETER]: { [AUTOMATION_STUDIO_EXPECTED_STATE_FACTS_KEY]: facts } } : input.written;
}

/**
 * Whether a step on this node acts on something outside the run: a domain
 * output that does not say it only observes -- by `metadata.effect`, by the
 * records it reads, or by being a check -- or one of Core's own acting nodes.
 * Core's control, data and timing nodes act on nothing.
 */
function stepActs(definition: AutomationStudioNodeDefinition): boolean {
  const metadata = definition.metadata ?? {};
  if (metadata.effect === "observe" || metadata.recordsPath !== undefined || metadata.verifiesState === true) return false;
  return definition.outputAction !== undefined || CORE_ACTING_NODE.test(definition.id);
}
