import type { AutomationStudioSubflowScope } from "./contracts.ts";
import { automationStudioSubflowDoneBefore } from "./done-before.ts";

// What a subflow builder's submit tool says of its brief (`./builder-loop.ts`,
// header, t570, t584, t594): the subflow's success check, and the brief that
// opens the description of its `flow` input -- the parts it does, in the
// person's words with the id an ending names each by, the task's other parts
// as other builders' (t676), what a dependent builder does when a part of its
// own is already done at its entry, and, for a callable subflow, the exact
// lines its part declares. Only a brief with a part that asks a lasting act is
// told to end blocked when a subflow before it did one (t676).

export const automationStudioSubflowBriefWords = Object.freeze({
  /** The brief, as the `flow` input's description opens with it. */
  brief(scope: AutomationStudioSubflowScope): string {
    return brief(scope);
  },
  /** What the submit tool says of the subflow's success check. */
  successCheck(scope: AutomationStudioSubflowScope): string {
    return successCheck(scope);
  }
});

/**
 * What the submit tool says of the subflow's success check (t569). A scope
 * with one: it is the plan's, as before, byte for byte. A scope with none --
 * the plan the project supervisor writes gives none -- proposing one is the
 * builder's, in the script's own `done when:` terms
 * (`../plan/flow-script-format.ts`): where the line goes for this kind of
 * subflow, and that it becomes the subflow's check, which its trial is judged
 * against (`./scoped-submission.ts`, `../../service/subflow-trial/run.ts`).
 */
function successCheck(scope: AutomationStudioSubflowScope): string {
  if (scope.successCheck !== undefined) return "Its success check is the plan's; leave out `done when:` for it or write exactly that.";
  const where = scope.interface ? `inside its own \`part ${scope.subflowKey}:\` block, before its first step` : "outside every block, after its last step";
  return `The plan gives it no success check, so propose one with it: a \`done when: <fact>\` line ${where}, saying what the page shows once it worked, for example \`done when: text t11 contains "Booked"\`. `
    + "It becomes this subflow's success check, and its trial is judged against it.";
}

/**
 * The brief, as the submit tool says it (header, t570): the parts this subflow
 * does, in the person's own words, and how it is written -- for a callable
 * subflow the exact `part`, `input:` and `output:` lines, by the names its
 * interface gives, which is what the scoped submission holds it to
 * (`./callable-target.ts`).
 */
function brief(scope: AutomationStudioSubflowScope): string {
  const key = scope.subflowKey;
  const parts = partsSaid(scope.parts);
  const own = `Your brief is the subflow "${key}" alone. It does only ${scope.parts.length === 1 ? "this part" : "these parts"} of the task: ${parts}. ${otherParts(scope)}${alreadyDone(scope)}`;
  const contract = scope.interface;
  if (!contract) return `${own} The router runs it, so it takes no inputs and hands back no outputs: write its steps outside every block, and any helper it needs as a part those steps call.`;
  const inputs = contract.inputs.map((port) => port.id);
  const outputs = contract.outputs.map((port) => port.id);
  const lines = [`part ${key}: <what it does>`, ...inputs.map((name) => `  input: ${name}`), ...outputs.map((name) => `  output: ${name} = $step.<label>.<output>`), "  step <label>: <what it does>", "    node: ...", "end"];
  const given = inputs.length ? `is given exactly ${names(inputs)}` : "is given no value";
  const handed = outputs.length ? `hands back exactly ${names(outputs)}` : "hands back no value";
  return `${own} Other subflows call it: it ${given} and ${handed}. So write it as one part with exactly these lines, its steps inside, and nothing outside every block:\n${lines.join("\n")}\n`
    +(outputs.length ? "Each output line names one of the part's own steps by its label and the output it binds. " : "")
    + "Any helper it needs is a further part it calls.";
}

/** Parts as the brief names them: the person's words, then the id a `doneBefore` names it by (header, t676). */
function partsSaid(parts: ReadonlyArray<{ partId: string; text: string }>): string {
  return parts.map((part) => `"${part.text}" (part ${part.partId})`).join("; ");
}

/**
 * The task's other parts (header, t676): named, where the scope carries them,
 * as other builders' parts -- doing one while exploring is allowed, but it
 * moves where that builder starts until a reset -- and never a step here.
 */
function otherParts(scope: AutomationStudioSubflowScope): string {
  const others = scope.outOfScope ?? [];
  if (!others.length) return "Any other part of the task is another builder's subflow: write none of its steps here.";
  return `The task's other ${others.length === 1 ? "part is" : "parts are"} another builder's subflow: ${partsSaid(others)}. `
    + "Doing one of them while you explore is allowed, but it is another builder's part: it changes where that builder's subflow starts until a reset puts the site back, and no step of this subflow does it, so write none of its steps here.";
}

/**
 * What a dependent builder is told of its part already done at its entry
 * (header, t594): nothing for a scope with no predecessors. Only a part that
 * asks a lasting act can be done before it, so a brief whose parts ask none is
 * told to build from its entry, and never to end blocked (t676).
 */
function alreadyDone(scope: AutomationStudioSubflowScope): string {
  if (!scope.predecessors.length) return "";
  const before = ` ${scope.predecessors.length === 1 ? "The subflow" : "The subflows"} ${names(scope.predecessors)} ${scope.predecessors.length === 1 ? "runs" : "run"} before it and ${scope.predecessors.length === 1 ? "leaves" : "leave"} the page where it starts. `;
  const acting = automationStudioSubflowDoneBefore.acting(scope);
  if (!acting.length) return `${before}Its parts ask for no lasting act, so no subflow before it can have done one of them: build them from that page with this subflow's own steps.`;
  return `${before}If the page there already shows a lasting act one of its parts asks for as done, a subflow before it did that part: write no step for it, and if nothing of this brief is left to do, `
    + `end the brief: complete with ${automationStudioSubflowDoneBefore.shape}, so the plan can change. `
    + `Only a part that asks a lasting act (${names(acting.map((part) => part.partId))}) can be done before it, and only by an act the run that prepared its entry landed: an act this build made while exploring is undone before every trial, so its step is still this subflow's to build.`;
}

function names(values: readonly string[]): string {
  return values.map((value) => `"${value}"`).join(", ");
}
