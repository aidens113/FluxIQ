// A FluxNode's goal: a sentence with `{placeholders}` that name its declared inputs,
// such as "Find the {count} cheapest listings for {query}." `{{` and `}}` write a
// literal brace. Any other brace is a mistake and is refused.

import type { JsonObject, JsonValue } from "../../core.ts";
import type { FluxNodeParseResult } from "../issue/index.ts";
import { canonicalJson } from "../json/index.ts";

const PLACEHOLDER_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/u;

/** One piece of a goal: literal text, or a placeholder naming an input. */
export type FluxNodeGoalPart = { text: string } | { input: string };

/** A goal split into parts, or what is wrong with its braces. */
export type FluxNodeGoalReading = { ok: true; parts: FluxNodeGoalPart[]; inputs: string[] } | { ok: false; problems: string[] };

/**
 * Splits a goal into text and placeholders. `inputs` lists each placeholder's name
 * once, in order of first use. A placeholder name is a letter or "_" followed by
 * letters, digits and "_".
 */
export function readFluxNodeGoal(goal: string): FluxNodeGoalReading {
  const parts: FluxNodeGoalPart[] = [];
  const inputs: string[] = [];
  const problems: string[] = [];
  let text = "";
  let index = 0;
  while (index < goal.length) {
    const char = goal[index];
    const next = goal[index + 1];
    if ((char === "{" && next === "{") || (char === "}" && next === "}")) {
      text += char;
      index += 2;
    } else if (char === "}") {
      problems.push(`A "}" at character ${index + 1} closes nothing; write "}}" for a literal brace.`);
      index += 1;
    } else if (char === "{") {
      const close = goal.indexOf("}", index + 1);
      const name = close < 0 ? "" : goal.slice(index + 1, close);
      if (close < 0 || !PLACEHOLDER_NAME.test(name)) {
        problems.push(`The "{" at character ${index + 1} does not start a placeholder such as {query}; write "{{" for a literal brace.`);
        index += 1;
      } else {
        if (text.length > 0) parts.push({ text });
        text = "";
        parts.push({ input: name });
        if (!inputs.includes(name)) inputs.push(name);
        index = close + 1;
      }
    } else {
      text += char;
      index += 1;
    }
  }
  if (text.length > 0) parts.push({ text });
  return problems.length > 0 ? { ok: false, problems } : { ok: true, parts, inputs };
}

/**
 * The goal with each placeholder replaced by its input: text as written, any other
 * value as canonical JSON. Refused when a placeholder's input is missing.
 */
export function fillFluxNodeGoal(goal: string, inputs: JsonObject): FluxNodeParseResult<string> {
  const reading = readFluxNodeGoal(goal);
  if (!reading.ok) return { ok: false, issues: reading.problems.map((message) => ({ path: "/goal", code: "goal.bad_brace", message })) };
  const missing = reading.inputs.filter((name) => !Object.hasOwn(inputs, name));
  if (missing.length > 0) return { ok: false, issues: missing.map((name) => ({ path: `/inputs/${name}`, code: "goal.missing_input", message: `The goal uses {${name}}, but no "${name}" input was given.` })) };
  const filled = reading.parts.map((part) => {
    if ("text" in part) return part.text;
    const value = inputs[part.input] as JsonValue;
    return typeof value === "string" ? value : canonicalJson(value);
  });
  return { ok: true, value: filled.join("") };
}
