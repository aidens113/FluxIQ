import { asRecord } from "../../home/model";
import type { StepValue } from "./types";

/** A recorded step keeps what it is given under `parameters`; every other step's values are its own. */
const RECORDED_STEP = "builtin.policy.action";

/**
 * Parts of a step a person never types: what it acts on is found live and saved with its full
 * fingerprint, so it changes by asking FluxIQ ("Describe it"), not in a field.
 */
const FOUND_LIVE = new Set(["target", "targets", "fingerprint", "evidence"]);

/** How deep a value may sit and still be offered as a field. */
const DEEPEST = 3;

/**
 * The values of a step a person can change in place, each at its path inside what the step is
 * given (`edit-flow-steps`' `set-value` and `bind-input`): plain text, numbers and yes-or-no
 * values, and values that read one of the Flow's inputs. References to other steps, what the
 * step acts on, and values that read something other than an input are left to the graph.
 */
export function stepValues(node: { definitionId: string; parameterValues: Record<string, unknown> }): StepValue[] {
  const given = node.definitionId === RECORDED_STEP ? asRecord(node.parameterValues.parameters) : node.parameterValues;
  if (!given || "$state" in given) return [];
  const values: StepValue[] = [];
  const visit = (record: Record<string, unknown>, path: string[]) => {
    for (const [key, value] of Object.entries(record)) {
      if (FOUND_LIVE.has(key) || key.startsWith("$") || /Ids?$/u.test(key)) continue;
      const at = [...path, key];
      const label = labelOf(at);
      if (typeof value === "string") values.push({ path: at, label, text: value, kind: "text" });
      else if (typeof value === "number" && Number.isFinite(value)) values.push({ path: at, label, text: String(value), kind: "number" });
      else if (typeof value === "boolean") values.push({ path: at, label, text: value ? "yes" : "no", kind: "yes-no" });
      else {
        const nested = asRecord(value);
        const input = inputOf(nested);
        if (input !== undefined) values.push({ path: at, label, text: "", kind: "text", input });
        else if (nested && !("$state" in nested) && at.length < DEEPEST) visit(nested, at);
      }
    }
  };
  visit(given, []);
  return values;
}

/** The Flow input a `{ $state: { path } }` binding reads, when it reads one directly. */
function inputOf(value: Record<string, unknown> | undefined): string | undefined {
  const path = asRecord(value?.$state)?.path;
  if (typeof path !== "string" || !/^[A-Za-z_][\w-]*$/u.test(path) || path === "item") return undefined;
  return path;
}

/** "searchText" under "query" reads "Query: search text". */
function labelOf(path: readonly string[]): string {
  const words = path.map((part) => part.replace(/([a-z0-9])([A-Z])/gu, "$1 $2").replace(/[_-]+/gu, " ").toLowerCase().trim());
  const sentence = words.join(": ");
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}
