// A caller's per-call settings for one attempt (`AutomationStudioAnswerFirstCallerOptions`), read
// and refused in one place before anything runs. They come from code in Core's own process, not from
// a request body, but code is wrong too, and a budget or a scope read wrongly is the costly kind of
// wrong: so every field is checked, an unknown one is refused, and what comes back is a copy, with
// the consequences in Core's order and the sites lowercased and without repeats. A refusal throws,
// which the service reports as the invalid input it is, before a purse opens or a call is made.

import { humannessSchema } from "@fluxiq/contracts/automation";
import { fluxNodeScopeSchema, isJsonObject } from "@fluxiq/contracts/fluxnode";
import { parseAutomationStudioPermittedConsequences } from "../../../../../runtime/action-permission-requests/index.ts";
import { automationStudioAnswerFirstRunOverridesRead } from "./run-overrides-read.ts";
import type { AutomationStudioAnswerFirstCallerOptions, AutomationStudioAnswerFirstCallerScope, AutomationStudioAnswerFirstPersonAskSink } from "../../flow-bootstrap-commands/index.ts";

const FIELDS: ReadonlySet<string> = new Set(["taskKey", "actScope", "model", "budgetUsd", "judge", "check", "personAsk", "scope", "inputs", "humanness", "runOverrides"]);
const SCOPE_FIELDS: ReadonlySet<string> = new Set(["permittedConsequences", "sites"]);
const JUDGE_MODES: ReadonlySet<unknown> = new Set(["auto", "always", "off"]);
const MOST_KEY_CHARS = 512;
const MODEL_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u;
const MOST_BUDGET_USD = 100_000;

export function automationStudioAnswerFirstCallerOptionsRead(given: unknown): AutomationStudioAnswerFirstCallerOptions {
  const options = record(given, "Answer-first caller options must be an object.");
  for (const key of Object.keys(options)) if (!FIELDS.has(key)) throw new Error(`Answer-first caller options do not take "${key}".`);
  const read: AutomationStudioAnswerFirstCallerOptions = {};
  const { taskKey, actScope, model, budgetUsd, judge, check, personAsk, scope, inputs, humanness, runOverrides } = options;
  if (taskKey !== undefined) {
    if (typeof taskKey !== "string" || taskKey.trim().length === 0 || taskKey.length > MOST_KEY_CHARS) throw new Error(`Answer-first caller taskKey must be 1 to ${MOST_KEY_CHARS} characters, not blank.`);
    read.taskKey = taskKey;
  }
  if (actScope !== undefined) {
    if (typeof actScope !== "string" || actScope.trim().length === 0 || actScope.length > MOST_KEY_CHARS) throw new Error(`Answer-first caller actScope must be 1 to ${MOST_KEY_CHARS} characters, not blank.`);
    read.actScope = actScope;
  }
  // The same rules a FluxNode's own options are held to (`fluxNodeOptionsSchema`), so the two never disagree on what is valid.
  if (model !== undefined) {
    if (typeof model !== "string" || !MODEL_ID.test(model)) throw new Error("Answer-first caller model must be a model id: 1 to 128 of letters, digits, \".\", \"_\", \":\", \"/\" and \"-\".");
    read.model = model;
  }
  if (budgetUsd !== undefined) {
    if (typeof budgetUsd !== "number" || !Number.isFinite(budgetUsd) || budgetUsd < 0 || budgetUsd > MOST_BUDGET_USD) throw new Error(`Answer-first caller budgetUsd must be a finite amount of dollars from 0 to ${MOST_BUDGET_USD}.`);
    read.budgetUsd = budgetUsd;
  }
  if (humanness !== undefined) {
    if (!humannessSchema.safeParse(humanness).success) throw new Error("Answer-first caller humanness must be a whole number from 0 to 100.");
    read.humanness = humanness as number;
  }
  if (judge !== undefined) {
    if (!JUDGE_MODES.has(judge)) throw new Error("Answer-first caller judge must be auto, always or off.");
    read.judge = judge as NonNullable<AutomationStudioAnswerFirstCallerOptions["judge"]>;
  }
  if (check !== undefined) {
    if (typeof check !== "function") throw new Error("Answer-first caller check must be a function.");
    read.check = check as NonNullable<AutomationStudioAnswerFirstCallerOptions["check"]>;
  }
  if (personAsk !== undefined) read.personAsk = sinkOf(personAsk);
  if (scope !== undefined) read.scope = scopeOf(scope);
  // A copy, so the caller changing its object later changes nothing a run is using.
  if (inputs !== undefined) {
    if (!isJsonObject(inputs)) throw new Error("Answer-first caller inputs must be an object of JSON values, by input name.");
    read.inputs = structuredClone(inputs);
  }
  if (runOverrides !== undefined) read.runOverrides = automationStudioAnswerFirstRunOverridesRead(runOverrides);
  return read;
}

function sinkOf(given: unknown): AutomationStudioAnswerFirstPersonAskSink {
  const sink = record(given, "Answer-first caller personAsk must be an object.");
  if (typeof sink.raised !== "function") throw new Error("Answer-first caller personAsk must have a raised function.");
  if (sink.answer !== undefined && typeof sink.answer !== "function") throw new Error("Answer-first caller personAsk.answer must be a function when given.");
  return given as AutomationStudioAnswerFirstPersonAskSink;
}

function scopeOf(given: unknown): AutomationStudioAnswerFirstCallerScope {
  const scope = record(given, "Answer-first caller scope must be an object.");
  for (const key of Object.keys(scope)) if (!SCOPE_FIELDS.has(key)) throw new Error(`Answer-first caller scope does not take "${key}".`);
  // A grant is said, never assumed: an empty list grants nothing, and no list is refused. The parser throws naming an unknown class.
  if (!Array.isArray(scope.permittedConsequences)) throw new Error("Answer-first caller scope.permittedConsequences must be a list, empty to grant no lasting act.");
  const permittedConsequences = parseAutomationStudioPermittedConsequences(scope.permittedConsequences);
  if (scope.sites === undefined) return { permittedConsequences };
  const sites = fluxNodeScopeSchema.safeParse({ sites: scope.sites, acts: [] });
  if (!sites.success || sites.data.sites === undefined) throw new Error("Answer-first caller scope.sites must be a list of host names, each optionally with a port, such as \"market.example\" or \"localhost:3000\".");
  return { permittedConsequences, sites: sites.data.sites };
}

function record(value: unknown, refusal: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(refusal);
  return value as Record<string, unknown>;
}
