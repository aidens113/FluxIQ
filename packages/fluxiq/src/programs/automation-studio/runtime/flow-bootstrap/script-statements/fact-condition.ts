// A `when:` or `done when:` line about the page, read into the fact a run
// observes (contract C9, t388).
//
// A handler's `when:` lines, a `start at:`'s `when:` lines and every `done
// when:` line say what the page shows, not which route a router takes, so they
// are not route conditions (`../authoring/condition.ts`, which a situation
// block's `when:` keeps). Each is one short line:
//
//   exists t5                      the control the evidence printed as t5 is there
//   absent t5 / visible t5 / enabled t5
//   text t7 contains "Signed in"   its text; `is`, `contains` or `matches`
//   value t4 is $input.city        a field's value, here a Flow or part input
//   count t9 is 3                  how many there are
//   dialog alertdialog "Too fast"  a dialog of that kind and name is showing;
//                                  `... absent` when it is gone
//
// The target is the handle a step would use, copied from the evidence, stored
// as a step's is (`{ handle }`); Core never reads it, and the host resolves it
// as it resolves a step's target. A hand-authored or test Flow, which has no
// evidence to copy a handle from, may name the element by a locator in place
// of the handle -- `exists at "<locator>"`, `text at "<locator>" contains
// "Ready"` -- stored as `{ locator }`, which the connected host interprets (the
// web domain reads it as a CSS selector) and nothing resolves
// (`./fact-locator.ts`, t402). The model-facing script format does not teach
// it: the model names elements by handle. A
// line that is none of these is refused with the shape it should have had,
// because a fact read wrongly is a handler that runs, or does not, quietly.
import type { AutomationStudioFlowBootstrapFactCondition, AutomationStudioFlowBootstrapIssue } from "../plan/index.ts";
import type { AutomationStudioFlowScriptCondition } from "../authoring/index.ts";
import { readAutomationStudioFlowScriptFactLocator, type AutomationStudioFlowScriptFactLocator } from "./fact-locator.ts";
import { scriptStatementRefusal } from "./statement-refusal.ts";

export type AutomationStudioFlowScriptFactReading =
  | { ok: true; fact: AutomationStudioFlowBootstrapFactCondition }
  | { ok: false; reason: string };

/** The kinds that take a target and nothing else, by every spelling read, and the kind each is. */
const PRESENCE: Readonly<Record<string, "exists" | "absent" | "visible" | "enabled">> = {
  exists: "exists", present: "exists",
  absent: "absent", missing: "absent", gone: "absent",
  visible: "visible", shown: "visible", showing: "visible",
  enabled: "enabled"
};
/** The comparisons a text or value fact takes. */
const COMPARISONS: Readonly<Record<string, "equals" | "contains" | "matches">> = {
  is: "equals", equals: "equals", "=": "equals",
  contains: "contains", includes: "contains",
  matches: "matches"
};
const INPUT = /^\$input\.([a-z][A-Za-z0-9]{0,31})$/u;
const DIALOG_KIND = /^[a-z][a-z-]{0,39}$/u;
/** The handle syntax a step's target is read by (`../authoring/values.ts`, which its barrel does not publish). */
const HANDLE_TOKEN = /^[A-Za-z0-9](?:[A-Za-z0-9_.:-]*[A-Za-z0-9])?$/u;
const HANDLE_MAX_LENGTH = 64;
const MAX_TEXT = 2_000;
const SHAPES = "`exists <handle>`, `absent <handle>`, `visible <handle>`, `enabled <handle>`, `text <handle> contains \"<words>\"`, `value <handle> is <value>`, `count <handle> is <number>`, or `dialog <kind> \"<name>\"`";

/** One fact line, read, or the reason it cannot be. */
export function readAutomationStudioFlowScriptFact(text: string): AutomationStudioFlowScriptFactReading {
  const tokens = tokenize(text.trim());
  if (!tokens) return { ok: false, reason: `a quote is not closed. A fact is ${SHAPES}.` };
  const [first, ...rest] = tokens;
  const kind = first && !first.quoted ? first.text.toLowerCase() : "";
  const presence = PRESENCE[kind];
  const read = presence || kind === "text" || kind === "value" || kind === "count" ? targetOf(rest) : undefined;
  if (read && "reason" in read) return { ok: false, reason: read.reason };
  if (presence) {
    const target = read?.target;
    if (!target || read.after.length) return { ok: false, reason: `\`${kind}\` takes one handle, copied from the evidence, and nothing after it: \`${kind} t5\`.` };
    return { ok: true, fact: { fact: presence, op: presence, target } };
  }
  if (kind === "text" || kind === "value") {
    const target = read?.target;
    const after = read?.after ?? [];
    const op = after[0] && !after[0].quoted ? COMPARISONS[after[0].text.toLowerCase()] : undefined;
    const value = valueOf(after.slice(1));
    if (!target || !op || value === undefined) return { ok: false, reason: `\`${kind}\` takes a handle, \`is\`, \`contains\` or \`matches\`, and a value: \`${kind} t7 contains "Signed in"\`.` };
    return { ok: true, fact: { fact: kind, op, value, target } };
  }
  if (kind === "count") {
    const target = read?.target;
    const words = read?.after ?? [];
    const number = words.length === 2 && !words[0]!.quoted && COMPARISONS[words[0]!.text.toLowerCase()] === "equals" ? words[1] : words.length === 1 ? words[0] : undefined;
    const count = number && !number.quoted && /^\d{1,6}$/u.test(number.text) ? Number(number.text) : undefined;
    if (!target || count === undefined) return { ok: false, reason: "`count` takes a handle and a whole number: `count t9 is 3`." };
    return { ok: true, fact: { fact: "count", op: "count", value: count, target } };
  }
  if (kind === "dialog") {
    const role = rest[0] && !rest[0].quoted ? rest[0].text.toLowerCase() : "";
    const name = rest[1]?.quoted ? rest[1].text : undefined;
    const tail = rest[2] && !rest[2].quoted ? PRESENCE[rest[2].text.toLowerCase()] : undefined;
    if (!DIALOG_KIND.test(role) || name === undefined || !name.trim() || rest.length > 3 || (rest.length === 3 && tail !== "absent" && tail !== "visible" && tail !== "exists")) {
      return { ok: false, reason: "`dialog` takes the dialog's kind and its name in quotes, then `absent` when it should be gone: `dialog alertdialog \"Slow down\"`." };
    }
    return { ok: true, fact: { fact: "dialog", op: tail === "absent" ? "absent" : "visible", target: { kind: "dialog", role, name: name.slice(0, 200) } } };
  }
  return { ok: false, reason: `a fact is ${SHAPES}; the target is the handle a step would use, copied from the evidence.` };
}

/**
 * Each of a list of `when:` or `done when:` lines read as a fact, or
 * `undefined` when one was refused; each refusal is pushed at its line. An
 * `unless:` line is refused too: a fact says what the page shows, and its
 * opposite is another kind (`absent` for `exists`).
 */
export function automationStudioFlowScriptFacts(
  conditions: readonly AutomationStudioFlowScriptCondition[],
  issues: AutomationStudioFlowBootstrapIssue[]
): AutomationStudioFlowBootstrapFactCondition[] | undefined {
  const facts: AutomationStudioFlowBootstrapFactCondition[] = [];
  let refused = false;
  for (const condition of conditions) {
    if (condition.negate) {
      issues.push(scriptStatementRefusal("flow_script.fact_invalid", `The \`unless:\` at line ${condition.line} says what the page does not show. Write it as a \`when:\` with the opposite kind: \`absent t5\` for a control that is not there, \`dialog <kind> "<name>" absent\` for a dialog that is gone.`, condition.line));
      refused = true;
      continue;
    }
    const reading = readAutomationStudioFlowScriptFact(condition.text);
    if (!reading.ok) {
      issues.push(scriptStatementRefusal("flow_script.fact_invalid", `The line at ${condition.line} could not be read as a fact about the page: ${reading.reason}`, condition.line));
      refused = true;
      continue;
    }
    facts.push(reading.fact);
  }
  return refused ? undefined : facts;
}

/**
 * The fact that says a fact no longer holds, where one can say it: the check
 * that a handler's recovery worked when its `when:` was something showing. A
 * comparison has no opposite a fact can state, so it has none.
 */
export function automationStudioFlowScriptFactGone(fact: AutomationStudioFlowBootstrapFactCondition): AutomationStudioFlowBootstrapFactCondition | undefined {
  if (fact.op === "exists" || fact.op === "visible") return { ...fact, fact: fact.fact === "dialog" ? "dialog" : "absent", op: "absent" };
  if (fact.op === "absent") return { ...fact, fact: fact.fact === "dialog" ? "dialog" : "exists", op: fact.fact === "dialog" ? "visible" : "exists" };
  return undefined;
}

type Token = { text: string; quoted: boolean };
type ElementTarget = { handle: string } | AutomationStudioFlowScriptFactLocator;

/**
 * A fact's element target and the words after it: a handle (one word), or
 * `at` and a quoted locator; the reason an `at` target cannot be read; or
 * `undefined` when there is no target, which each kind refuses in its own words.
 */
function targetOf(tokens: readonly Token[]): { target: ElementTarget; after: Token[] } | { reason: string } | undefined {
  const [first, second] = tokens;
  if (first && !first.quoted && first.text.toLowerCase() === "at") {
    if (!second?.quoted) return { reason: "`at` takes a locator in quotes: `exists at \"<locator>\"`." };
    const locator = readAutomationStudioFlowScriptFactLocator(second.text);
    return locator.ok ? { target: locator.target, after: tokens.slice(2) } : { reason: locator.reason };
  }
  const target = handle(first);
  return target ? { target, after: tokens.slice(1) } : undefined;
}

/** Words and `"quoted words"`, or `undefined` when a quote is left open. */
function tokenize(text: string): Token[] | undefined {
  const tokens: Token[] = [];
  let at = 0;
  while (at < text.length) {
    if (/\s/u.test(text[at]!)) {
      at += 1;
      continue;
    }
    if (text[at] === "\"") {
      const close = text.indexOf("\"", at + 1);
      if (close < 0) return undefined;
      tokens.push({ text: text.slice(at + 1, close), quoted: true });
      at = close + 1;
      continue;
    }
    let end = at;
    while (end < text.length && !/\s/u.test(text[end]!)) end += 1;
    tokens.push({ text: text.slice(at, end), quoted: false });
    at = end;
  }
  return tokens;
}

/**
 * A target handle -- one unquoted word, as a step's `target:` is written -- in
 * the form a step's target takes once read (`{ handle }`, `../authoring/values.ts`):
 * an object, because the runtime keeps only an object as a fact's target
 * (`executor/lifecycle/fact-conditions-parse.ts`), and the same object, so the
 * host resolves a fact's handle exactly as it resolves a step's.
 */
function handle(token: Token | undefined): { handle: string } | undefined {
  return token && !token.quoted && HANDLE_TOKEN.test(token.text) && token.text.length <= HANDLE_MAX_LENGTH ? { handle: token.text } : undefined;
}

/** A fact's value: quoted words, a `$input.<name>`, a number, or the bare words left. */
function valueOf(tokens: readonly Token[]): AutomationStudioFlowBootstrapFactCondition["value"] | undefined {
  if (!tokens.length) return undefined;
  if (tokens.length === 1) {
    const [only] = tokens;
    if (only!.quoted) return only!.text.slice(0, MAX_TEXT);
    const input = INPUT.exec(only!.text);
    if (input) return { input: input[1]! };
    if (only!.text.startsWith("$")) return undefined;
  }
  const words = tokens.map((token) => token.text).join(" ").trim();
  return words ? words.slice(0, MAX_TEXT) : undefined;
}
