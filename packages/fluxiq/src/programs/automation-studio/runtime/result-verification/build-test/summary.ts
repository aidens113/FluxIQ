// What the judge of a build's test is shown: every step the Flow proposes, in
// order, each with its own words and how the test answered it.
//
// **Why the build's test is judged at all (t195-w25).** A completion the
// model declares ready used to be held to the build's own reading of the
// instruction's acts, and that reading refused correct Flows (lane B's six
// `choice_is_the_act_step` refusals, run 36's twenty-four) and accepted wrong
// ones (run 40: the napkins claimed on the towels' Search press). So the test
// that runs the Flow from its start is now judged against the instruction by
// the same verifier a finished run gets, and this is its packet.
//
// **What it is made of.** A test stores no record set, so the summary carries
// none and Core's own arithmetic over record counts has nothing to say
// (`../core-observation.ts`). What carries the judgement is `buildTest`:
//
//   - `target`, each step's own words: the strings it ran with, then the ones
//     it was given, with the domain's denied keys, Core's executable-target
//     keys and every locator-shaped string left out. A step that pressed
//     "Add to cart" on the towels' page says so; one that never named the
//     napkins does not.
//   - `outcome`, from the test that passed, or `not_run`.
//   - `observed`, what the test saw for a step that reads (the rows) or a step
//     it only checked, screened like any other evidence. A replayed list read
//     names its rows, and the rows each condition left out by itself, by label
//     (`readRows`, `./read-rows.ts`).
//   - `explored`, what a checked step did while the build explored it, since
//     the test did not do it again.
//   - `claims`, `checklist` and `missingActs`: the model's claims and the
//     build's own check. Information, never proof.
//   - `carried`, a step seeded from an earlier Flow (run 41). Such a step has
//     no replay, so the draft was not testable and nothing ran.
//   - `notes`, what the completion check's capability questions found of the
//     Flow -- no step producing the records asked for, or none going to where
//     it starts (t195-w28a). Information the judge confirms against the steps,
//     never a refusal.
//
// **What it does not carry.** The cart, a confirmation, any page the Flow does
// not itself read: the test does not look at them (t195-w25 open question 5).
// Nor a page view inside an observation, Core's bookkeeping, or text another
// step already sent (`./observation.ts`, t195-w28a), nor a handle or a
// machine-minted key among a step's words.

import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import type { AutomationStudioFlowNode } from "../../../model/index.ts";
import {
  automationStudioFlowDraftReplayOutcomeWord,
  automationStudioFlowDraftStepById,
  automationStudioFlowDraftStepIsProposed,
  type AutomationStudioFlowDraftReplayOutcome,
  type AutomationStudioFlowDraftStep,
  type AutomationStudioFlowDraftStepRouting
} from "../../flow-draft/index.ts";
import {
  automationStudioInstructedActsChecklist,
  automationStudioInstructedActsChecklistValue,
  checkAutomationStudioInstructedActs
} from "../../flow-bootstrap/instructed-acts/index.ts";
import {
  AUTOMATION_STUDIO_PLAN_NODE_HANDLE_KEY,
  automationStudioEvidenceKey,
  automationStudioExecutableTargetKey,
  automationStudioFlowDraftStepCarried,
  automationStudioLocatorShapedText,
  automationStudioWithoutLocators,
  screenAutomationStudioLlmEvidence
} from "../../llm/index.ts";
import type { AutomationStudioBuildTestAccount, AutomationStudioBuildTestNote, AutomationStudioBuildTestStep, AutomationStudioRunResultSummary } from "../contracts.ts";
import { summarizeAutomationStudioRunResult } from "../result-summary.ts";
import { automationStudioBuildTestObservationReader } from "./observation.ts";

/**
 * The test a build ran, as this builder reads it.
 *
 * Structurally the report the dry-run gate hands `observeTest` (W1's
 * `AutomationStudioFlowDraftTestReport` in `llm/node-tools/dry-run-gate.ts`),
 * declared here so the two could be written at once. Only what is read is named.
 */
export type AutomationStudioBuildTestReportInput = {
  verdict: { outcomes: readonly AutomationStudioFlowDraftReplayOutcome[] };
  observations: readonly { step: number; stepId?: string | undefined; resultCode?: string | undefined; evidence: JsonValue }[];
  reused: boolean;
};

/** Whether a step was seeded from an earlier Flow rather than taken in this build (`llm/node-tools/draft-from-flow.ts`). */
const carriedStep = automationStudioFlowDraftStepCarried;

/**
 * Keys whose value is a declaration Core reads, the node a step runs, or a
 * handle Core issued for something observed, never what the step acted on.
 */
const NOT_TARGET_WORDS = new Set(["consequences", "node", AUTOMATION_STUDIO_PLAN_NODE_HANDLE_KEY]);

// **A repeated step's template row is left out by the domain's declaration.**
// A step repeated over another step's rows is given each kept row in turn, and
// that row replaces the one it was built on, so the press acts on the control
// inside each row (the domain's row scoping). The row it was built on is then
// only its template, and naming it told the judge of run `run-murwcaj0` the
// loop pressed one remembered card ("not a per-row confirm"). So a repeated
// step's words leave out the keys under which its argument carries that row
// and say where its control is found instead; an unrepeated step keeps them,
// since there it is the row the step acts on. Which keys those are is the
// domain's to say (`rowContextKeys`, declared beside `deniedEvidenceKeys`):
// Core names no domain's key, and with none declared every word is kept.

/**
 * A machine-minted key rather than a word: one unbroken run of letters, digits
 * and underscores, long, with several underscores and digits in it -- the
 * domain's own name for a field it detected (`div_x0531l50_x1r2vv8_...` in run
 * 36, two per read, 228 characters a request). A product code or a person's
 * text has spaces, hyphens or few underscores, and is kept.
 */
function machineMinted(text: string): boolean {
  return text.length >= 24 && /^\w+$/u.test(text) && (text.match(/_/gu)?.length ?? 0) >= 3 && (text.match(/[0-9]/gu)?.length ?? 0) >= 3;
}

/**
 * The summary a build's test is judged from.
 *
 * `deniedEvidenceKeys` absent means nobody declared them, and then no word or
 * observation of the domain's is carried at all: the request check refuses a
 * summary sent without a declaration anyway.
 */
export function automationStudioBuildTestResultSummary(input: {
  steps: readonly AutomationStudioFlowDraftStep[];
  /** The test that passed this round; absent when no test applied. */
  report?: AutomationStudioBuildTestReportInput | undefined;
  /** The Flow's authored nodes, for the Flow's shape. */
  nodes: readonly AutomationStudioFlowNode[];
  instructionText?: string | undefined;
  /** The loop's result, for the acts it claims. */
  result?: JsonObject | undefined;
  startLocation?: string | undefined;
  deniedEvidenceKeys?: readonly string[] | undefined;
  /**
   * The keys under which the domain's step arguments carry the row a control
   * was found in, as the domain declares them (see the comment above
   * `machineMinted`): left out of a repeated step's words. Absent, none are.
   */
  rowContextKeys?: readonly string[] | undefined;
  /** The domain's declared view keys, left out of every observation (`./observation.ts`). */
  observedStateKeys?: readonly string[] | undefined;
  /** What the completion check found the accepted Flow cannot do (`AutomationStudioBuildTestNote`). */
  notes?: readonly AutomationStudioBuildTestNote[] | undefined;
}): AutomationStudioRunResultSummary {
  const denied = input.deniedEvidenceKeys;
  const observe = denied === undefined ? undefined : automationStudioBuildTestObservationReader({ deniedEvidenceKeys: denied, observedStateKeys: input.observedStateKeys });
  const proposed = input.steps.filter(automationStudioFlowDraftStepIsProposed);
  let withheld = denied === undefined;
  const claimed = resultClaims(input.result?.acts);
  const steps = proposed.map((step): AutomationStudioBuildTestStep => {
    const outcome = input.report ? outcomeOf(step, input.report.verdict.outcomes) : undefined;
    const checked = outcome?.mode === "verify";
    const words = denied === undefined ? [] : targetWords(step, denied, input.steps, input.rowContextKeys ?? []);
    const claims = [...new Set([...(step.acts ?? []), ...claimed.filter((claim) => names(claim.step, step)).map((claim) => claim.action)])]
      .filter((claim) => claim.trim() && !automationStudioLocatorShapedText(claim));
    const runs = step.routing ? routingValue(step.routing, input.steps) : undefined;
    const observed = observe && input.report && (step.effect !== "mutate" || checked)
      ? observe(step, observationsOf(step, input.report.observations))
      : undefined;
    if (observed?.withheld) withheld = true;
    return {
      step: step.position,
      action: step.actionId,
      ...(words.length ? { target: words } : {}),
      ...(claims.length ? { claims } : {}),
      outcome: outcome ? outcomeWord(outcome) : "not_run",
      ...(checked ? { withheld: true as const } : {}),
      ...(outcome?.withheldBy !== undefined ? { withheldBy: outcome.withheldBy } : {}),
      ...(runs ? { runs } : {}),
      ...(carriedStep(step) ? { carried: true as const } : {}),
      ...(observed?.value !== undefined ? { observed: observed.value } : {}),
      ...(checked ? { explored: explored(step) } : {})
    };
  });
  const checklist = automationStudioInstructedActsChecklistValue(automationStudioInstructedActsChecklist({
    instructionText: input.instructionText,
    draftSteps: input.steps,
    startLocation: input.startLocation
  }));
  const check = checkAutomationStudioInstructedActs({
    instructionText: input.instructionText,
    result: input.result ?? {},
    draftSteps: input.steps,
    startLocation: input.startLocation
  });
  const buildTest: AutomationStudioBuildTestAccount = {
    kind: "build_test",
    test: input.report ? (input.report.reused ? "reused" : "ran") : "not_run",
    steps,
    ...(checklist?.length ? { checklist: checklist.map((item) => automationStudioWithoutLocators(item)) } : {}),
    ...(!check.ok ? { missingActs: automationStudioWithoutLocators(check.missingActs) } : {}),
    ...(input.notes?.length ? { notes: input.notes.map((note) => automationStudioWithoutLocators({ ...note })) } : {})
  };
  const shape = summarizeAutomationStudioRunResult({ recordSets: [], flowNodes: input.nodes, deniedEvidenceKeys: denied });
  return {
    schemaVersion: "automation-studio.run-result-summary.v1",
    totalRecordCount: 0,
    totalRefusedCount: 0,
    totalRowsMissingRequired: 0,
    recordSetCount: 0,
    recordSets: [],
    flowShape: shape.flowShape,
    withheld: withheld || shape.withheld,
    buildTest
  };
}

/** The positions of the carried steps the test did not run: no evidence their acts are done. */
export function automationStudioBuildTestUntestedCarried(account: AutomationStudioBuildTestAccount | undefined): number[] {
  return (account?.steps ?? []).filter((step) => step.carried && step.outcome === "not_run").map((step) => step.step);
}

/** How the test answered this step: by its id, or by its position where neither side has one. */
function outcomeOf(step: AutomationStudioFlowDraftStep, outcomes: readonly AutomationStudioFlowDraftReplayOutcome[]): AutomationStudioFlowDraftReplayOutcome | undefined {
  const byId = step.id === undefined ? undefined : outcomes.find((outcome) => outcome.stepId === step.id);
  return byId ?? outcomes.find((outcome) => outcome.stepId === undefined && outcome.step === step.position) ?? step.replayed;
}

function outcomeWord(outcome: AutomationStudioFlowDraftReplayOutcome): AutomationStudioBuildTestStep["outcome"] {
  const word = automationStudioFlowDraftReplayOutcomeWord(outcome);
  return OUTCOME_WORDS.has(word) ? word as AutomationStudioBuildTestStep["outcome"] : outcome.status;
}

const OUTCOME_WORDS: ReadonlySet<string> = new Set(["replayed", "verified", "present", "remembered", "failed", "changed", "unreproducible"]);

/** What the test observed of this step, each answer as it came; the reader makes one a value, several a list. */
function observationsOf(step: AutomationStudioFlowDraftStep, observations: AutomationStudioBuildTestReportInput["observations"]): JsonValue[] {
  return observations.filter((observation) => step.id !== undefined && observation.stepId !== undefined
    ? observation.stepId === step.id
    : observation.step === step.position).map((observation) => observation.evidence);
}

/**
 * The step's own words: every string it ran with, then every string it was
 * given, once each, in that order. Never under a denied key, never under
 * Core's executable-target keys (a handle, or what a handle resolved to), and
 * never a string shaped like a locator or a credential. A repeated step's
 * words also leave out the domain's declared row keys (`rowKeys`).
 */
function targetWords(step: AutomationStudioFlowDraftStep, denied: readonly string[], steps: readonly AutomationStudioFlowDraftStep[], rowKeys: readonly string[]): string[] {
  const deniedKeys = new Set(denied.map(automationStudioEvidenceKey));
  const repeated = step.routing?.kind === "repeat";
  const rowKeySet = new Set(rowKeys.map(automationStudioEvidenceKey));
  const words: string[] = [];
  const collect = (value: unknown): void => {
    if (typeof value === "string") {
      const text = value.trim();
      if (text && text !== step.actionId && !words.includes(text) && !automationStudioLocatorShapedText(text) && !machineMinted(text)
        && !screenAutomationStudioLlmEvidence(text, []).secretShaped) words.push(text);
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) collect(item);
      return;
    }
    if (!value || typeof value !== "object") return;
    for (const [key, item] of Object.entries(value)) {
      if (deniedKeys.has(automationStudioEvidenceKey(key)) || automationStudioExecutableTargetKey(key) || NOT_TARGET_WORDS.has(key)) continue;
      if (repeated && rowKeySet.has(automationStudioEvidenceKey(key))) continue;
      collect(item);
    }
  };
  collect(step.ranWith);
  collect(step.input);
  if (step.routing?.kind === "repeat") {
    const over = automationStudioFlowDraftStepById(steps, step.routing.over)?.position;
    words.push(over === undefined ? "in each row its listing keeps" : `in each row step ${over} keeps`);
  }
  return words;
}

/** When the step runs, in the positions the judge reads rather than the ids the draft keeps. */
function routingValue(routing: AutomationStudioFlowDraftStepRouting, steps: readonly AutomationStudioFlowDraftStep[]): JsonObject {
  const at = (id: string): number | null => automationStudioFlowDraftStepById(steps, id)?.position ?? null;
  if (routing.kind === "only_if") return { kind: routing.kind, check: at(routing.check) };
  if (routing.kind === "on_failed") return { kind: routing.kind, to: at(routing.to) };
  if (routing.kind === "repeat") return { kind: routing.kind, over: at(routing.over), through: at(routing.through) };
  return { kind: routing.kind };
}

/** What a checked step did while the build explored it. */
function explored(step: AutomationStudioFlowDraftStep): NonNullable<AutomationStudioBuildTestStep["explored"]> {
  return {
    changed: step.effectApplied === undefined ? "unknown" : step.effectApplied ? "yes" : "no",
    ...(step.resultCode ? { resultCode: step.resultCode } : {}),
    ...(step.stateBefore !== undefined && step.stateAfter !== undefined ? { stateChanged: step.stateBefore !== step.stateAfter } : {})
  };
}

/** The acts the build's result claims, each with the step it names, as written. */
function resultClaims(value: unknown): Array<{ action: string; step: string }> {
  const text = (item: unknown): string | undefined => typeof item === "string" && item.trim()
    ? item.trim()
    : typeof item === "number" && Number.isSafeInteger(item) ? `${item}` : undefined;
  if (Array.isArray(value)) {
    return value.flatMap((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return [];
      const record = item as Record<string, unknown>;
      const step = text(record.step ?? record.stepId ?? record.step_id ?? record.id);
      const action = text(record.action ?? record.act ?? record.name);
      return step && action ? [{ action, step }] : [];
    });
  }
  if (!value || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([action, step]) => {
    const named = text(step);
    return named ? [{ action, step: named }] : [];
  });
}

/** Whether a claim's step names this step: by its id, or by its position. */
function names(named: string, step: AutomationStudioFlowDraftStep): boolean {
  const trimmed = named.trim().toLowerCase();
  if (step.id !== undefined && step.id.toLowerCase() === trimmed) return true;
  const position = /^(?:step\s*|#)?([0-9]{1,4})$/u.exec(trimmed)?.[1];
  return position !== undefined && Number(position) === step.position;
}
