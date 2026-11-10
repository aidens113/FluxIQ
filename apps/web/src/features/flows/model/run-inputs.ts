import type { OutlinePort } from "../wire";

/**
 * The inputs a run is given, from what the person typed for each of the Flow's needs: a number
 * input as a number, a yes-or-no input as true or false, anything else as the text typed.
 * A required input left empty is refused with its name; an optional one left empty is left out.
 */
export function runInputs(needs: readonly OutlinePort[], typed: Readonly<Record<string, string>>): { ok: true; inputs: Record<string, unknown> } | { ok: false; reason: string } {
  const inputs: Record<string, unknown> = {};
  for (const port of needs) {
    const text = (typed[port.id] ?? "").trim();
    if (!text) {
      if (port.required) return { ok: false, reason: `Fill in “${port.name}” to run this Flow.` };
      continue;
    }
    if (port.type === "number") {
      const number = Number(text);
      if (!Number.isFinite(number)) return { ok: false, reason: `“${port.name}” needs a number.` };
      inputs[port.id] = number;
    } else if (port.type === "yes or no") {
      inputs[port.id] = /^(yes|true|y|1)$/iu.test(text);
    } else {
      inputs[port.id] = text;
    }
  }
  return { ok: true, inputs };
}
