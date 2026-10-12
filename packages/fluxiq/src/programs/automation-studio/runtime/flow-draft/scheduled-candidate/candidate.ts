// An unchanged saved step, scheduled to run as saved in the build's next test.
//
// **An unchanged saved step is scheduled when its declaration allows (t439).**
// A candidate used to be minted only for a node that declared consequences and
// whose start the run being repaired captured. A Flow written as a script
// declares only its presses (`../../flow-bootstrap/plan/flow-script-format.ts`,
// the web domain's one rule), and a failed run never starts the nodes after the
// one it failed at, so most saved steps held no candidate: the completion gate
// then demanded a live rerun of each, which the domain refused, and repair
// never completed (`run-mv4912r9-53b05a51`, three `complete` decisions refused
// `full_run_required` until the budget ran out). The Flow ran each such step
// that way in its own judged trial, and its playback runs it that way again,
// so the test does too.
//
// **Except a step that must declare and did not.** Core's permission gate is
// asked about an action from its declaration, and one that declared nothing is
// never asked about (`../../action-permissions/gate.ts`), so a saved press with
// no declaration, run in a test, would reach a money, delete or send control
// unasked (supervisor review, t439). Whether a step must declare is its
// domain's rule, read off its node definition by the caller
// (`automationStudioNodeDeclarationRequired`); unsaid, it must. Such a step
// gets no candidate, so the gate lists it to be rerun with its declaration.
//
// **The saved version is kept beside every seeded step, scheduled or not.**
// A changed optional step the test never exercised is put back to it before
// the Flow is saved (`../carried-step/untested-edit.ts`).
//
// `from` is where the run being repaired saw the node start, when it did. The
// test runs the Flow from its start and reaches each step through the steps
// before it, as playback does; only the first step needs a start to put the
// page back to (`../dry-run.ts`), and a step without one is sent without it.
//
// A declaration the Flow saved is retained exactly, and a missing one stays
// missing: which steps must declare is the domain's rule, and the domain
// answers a saved step for what its Flow saved.

import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioFlowDraftStep } from "../step.ts";

/** An unchanged saved configuration awaiting a fresh test, never performed proof. */
export type AutomationStudioFlowDraftScheduledCandidate = { readonly sourceNodeId: string };

type Held = { candidate: AutomationStudioFlowDraftScheduledCandidate; configuration: string; input: JsonObject; from: JsonObject | undefined };
const held = new WeakMap<AutomationStudioFlowDraftStep, Held>();
/** The input each seeded step was read with, as its Flow saved it; never changed by an edit of the step. */
const saved = new WeakMap<AutomationStudioFlowDraftStep, JsonObject>();

/**
 * Minted only while reading an actual saved node, with its captured start where
 * the run being repaired captured one, and only where the step declared its
 * consequences or `declarationRequired` says it need not (header).
 */
export function automationStudioFlowDraftScheduleCandidate(step: AutomationStudioFlowDraftStep, sourceNodeId: string, from: JsonObject | undefined, declarationRequired = true): void {
  if (!sourceNodeId) return;
  saved.set(step, structuredClone(step.input));
  const declarations = step.input.consequences;
  const declared = Array.isArray(declarations) && declarations.every((value) => typeof value === "string");
  if (!declared && declarationRequired) return;
  const candidate = Object.freeze({ sourceNodeId });
  step.scheduledCandidate = candidate;
  held.set(step, { candidate, configuration: configuration(step), input: structuredClone(step.input), from: from === undefined ? undefined : structuredClone(from) });
}

/** Only the loop's trusted initial seed copy transfers correspondence. */
export function automationStudioFlowDraftCopyScheduledCandidate(source: AutomationStudioFlowDraftStep, copy: AutomationStudioFlowDraftStep): void {
  const original = read(source);
  if (!original || configuration({ ...copy, position: source.position }) !== original.configuration) return;
  held.set(copy, { ...original, configuration: configuration(copy) });
}

/** Fresh values for a current unchanged candidate, without historical execution claims; `from` only where a start was captured. */
export function automationStudioFlowDraftScheduledCandidateCall(step: AutomationStudioFlowDraftStep): { input: JsonObject; from?: JsonObject } | undefined {
  const value = read(step);
  if (!value) return undefined;
  return { input: structuredClone(value.input), ...(value.from === undefined ? {} : { from: structuredClone(value.from) }) };
}

/** The input a seeded step's Flow saved, whatever was done to the step since; nothing for a step no Flow seeded. */
export function automationStudioFlowDraftSavedInput(step: AutomationStudioFlowDraftStep): JsonObject | undefined {
  const value = saved.get(step);
  return value === undefined ? undefined : structuredClone(value);
}

function read(step: AutomationStudioFlowDraftStep): Held | undefined {
  const value = held.get(step);
  if (step.ranWith !== undefined || step.replay !== undefined || step.effectApplied !== undefined || step.checkedCandidate !== undefined || step.priorExecution !== undefined) return undefined;
  return value && step.scheduledCandidate === value.candidate && configuration(step) === value.configuration ? value : undefined;
}

function configuration(step: AutomationStudioFlowDraftStep): string {
  return JSON.stringify([step.id, step.position, step.actionId, step.toolId, step.input, step.effect, step.proposes, step.disposition, step.routing, step.settings, step.acts, step.routeSignatures]);
}
