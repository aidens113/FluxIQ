// Observations identify available states, never which state an instruction asks
// to leave. Complete pairs must agree, regardless of direction or frequency.
import type { JsonObject } from "../../../../core/index.ts";
import { automationStudioToggleStateSignature } from "./signature.ts";
import { automationStudioToggleStateValueKey } from "./value-key.ts";

type Observation = { signature: JsonObject; beforeSignature?: JsonObject };
type Control = { stateful: true; shown?: JsonObject; ensures?: JsonObject };
type State = { signature: JsonObject; observed: Set<string> };
export type AutomationStudioToggleStateChoice =
  | { kind: "unknown" }
  | { kind: "selected"; signature: JsonObject }
  | { kind: "refused"; code: string; message: string };

/** Reads an explicit exact observed state; neither a first press nor a majority supplies task intent. */
export function automationStudioToggleStateChoice(input: {
  parameters?: JsonObject | undefined;
  explored: readonly Observation[];
  controls?: readonly (Control | undefined)[] | undefined;
}): AutomationStudioToggleStateChoice {
  const states = new Map<string, State>();
  const pairs: string[][] = [];
  let inconsistent = false;
  const add = (value: unknown, observed: string): string | undefined => {
    const signature = automationStudioToggleStateSignature(value);
    if (!signature) return undefined;
    const key = automationStudioToggleStateValueKey(signature);
    const state = states.get(key) ?? { signature, observed: new Set<string>() };
    state.observed.add(observed);
    states.set(key, state);
    return key;
  };
  const pair = (first: string | undefined, second: string | undefined): void => {
    if (first === undefined || second === undefined) return;
    if (first === second) inconsistent = true;
    else pairs.push([first, second].sort());
  };
  for (const press of input.explored) pair(add(press.beforeSignature, "before press"), add(press.signature, "after press"));
  for (const control of input.controls ?? []) {
    if (control?.stateful === true) pair(add(control.shown, "shown"), add(control.ensures, "press would leave"));
  }
  const known = input.explored.length > 0 || input.controls?.some((control) => control?.stateful === true) === true;
  const selected = input.parameters && Object.hasOwn(input.parameters, "ensureState");
  if (!known && !selected) return { kind: "unknown" };
  const firstPair = pairs[0];
  if (inconsistent || states.size > 2 || pairs.some((each) => each[0] !== firstPair![0] || each[1] !== firstPair![1])
    || (firstPair && [...states.keys()].some((key) => !firstPair.includes(key)))) {
    return { kind: "refused", code: "candidate.toggle_state_unresolved", message: "This step has incompatible observed state evidence. Obtain a fresh observation of this control's two states before choosing ensureState; conflicting observations cannot choose its state." };
  }
  if (known && !states.size) return { kind: "refused", code: "candidate.toggle_state_unresolved", message: "This step names a stateful control, but its observed signatures are unavailable. Obtain a readable observation of its states before choosing ensureState." };
  const choices = [...states.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, state]) => ({ signature: state.signature, observed: [...state.observed].sort() }));
  const guidance = `Choose the state the instruction asks to leave. Write ensureState as an exact copy of one of these observed signatures: ${JSON.stringify(choices)}. A press may have begun with the control already in that state.`;
  if (!selected) return { kind: "refused", code: "candidate.toggle_state_required", message: `This step switches between observed states. ${guidance}` };
  const signature = automationStudioToggleStateSignature(input.parameters!.ensureState);
  const observed = signature ? states.get(automationStudioToggleStateValueKey(signature)) : undefined;
  return observed ? { kind: "selected", signature: structuredClone(observed.signature) }
    : { kind: "refused", code: "candidate.toggle_state_unobserved", message: `This step's ensureState does not exactly match an observed state tied to it. ${guidance}` };
}
