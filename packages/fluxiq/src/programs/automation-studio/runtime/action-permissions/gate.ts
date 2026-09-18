// Where Core decides, for one run, whether the action a domain is about to
// take is one a person allowed.
//
// One gate per run. It holds the consequences the run's grant permits, sees
// every piece of evidence the domain hands back, and hands the domain a check
// with every action. The first action whose consequences the run does not hold
// raises a request, and the caller ends the run on it: the gate records the
// request, the caller reads it back and stops. Nothing is parked.
//
// **Fail closed.** No grant, an empty grant and a grant naming something Core
// does not recognise all permit nothing. There is no consequence the gate
// assumes is fine, and no path through it that permits an action whose
// declaration it could not read -- that throws, and the action fails.
//
// **Nothing past the evidence boundary.** The request carries the control's
// name only when that name already appears in evidence this run returned to the
// model. A name the gate cannot find there -- a locator, a fragment of markup,
// an internal id, text the model never saw -- is withheld, and the request says
// "a control it cannot name here" instead. Withheld, not refused: the person is
// still asked, with the action, the consequence and the reason intact, and
// nothing new leaves the domain to ask them.

import { randomUUID } from "node:crypto";
import type { JsonValue } from "../../../../core/index.ts";
import type { AutomationStudioLlmEvidenceToolExecutionResult } from "../llm/index.ts";
import { automationStudioConsequencesInOrder, isAutomationStudioActionConsequence, type AutomationStudioActionConsequence } from "./consequences.ts";
import { readAutomationStudioActionDeclaration, type AutomationStudioActionPermissionCheck } from "./declaration.ts";
import type { AutomationStudioInstructedConsequence } from "./instructed.ts";
import {
  AUTOMATION_STUDIO_ACTION_PERMISSION_CONTROL_NAME_MAX,
  AUTOMATION_STUDIO_ACTION_PERMISSION_REQUEST_SCHEMA_VERSION,
  automationStudioActionPermissionSentence,
  isAutomationStudioActionPermissionCarriedName,
  type AutomationStudioActionPermissionAction,
  type AutomationStudioActionPermissionRequest,
  type AutomationStudioActionPermissionStage
} from "./request.ts";

/** No class instructed: the answer when there is no instruction to read, or reading it failed. */
const NOTHING_INSTRUCTED: readonly AutomationStudioInstructedConsequence[] = Object.freeze([]);

/** How much shown text a gate keeps to find names in. Past it, names are withheld rather than the memory grown. */
const MAX_SHOWN_CHARACTERS = 4_000_000;

export type AutomationStudioActionPermissionGateInput = {
  /** What the person allowed this run. Absent permits nothing. */
  permittedConsequences?: readonly string[] | undefined;
  stage: AutomationStudioActionPermissionStage;
  /** The instructions the run is carrying out, which is why it wanted anything at all. */
  instructionIds?: readonly string[] | undefined;
  /**
   * What the person's instruction already asks for, when it is known: the set
   * stored with a Flow, read through `currentAutomationStudioInstructedConsequences`.
   */
  instructed?: readonly AutomationStudioInstructedConsequence[] | undefined;
  /**
   * How to find out, when it is not known yet: called at most once, on the
   * first action that declares a lasting consequence. A rejection, or an
   * answer with nothing grounded in it, adds nothing, so the run asks.
   */
  deriveInstructed?: (() => Promise<readonly AutomationStudioInstructedConsequence[]>) | undefined;
  now?: (() => number) | undefined;
  newRequestId?: (() => string) | undefined;
};

export class AutomationStudioActionPermissionGate {
  private readonly permitted: ReadonlySet<AutomationStudioActionConsequence>;
  private readonly shown: string[] = [];
  private shownCharacters = 0;
  private raised: AutomationStudioActionPermissionRequest | undefined;
  private raisedRef: string | undefined;
  private readonly stopped = new AbortController();
  private instructedEntries: readonly AutomationStudioInstructedConsequence[] | undefined;
  private deriving: Promise<{ derived: true; entries: readonly AutomationStudioInstructedConsequence[] } | { derived: false; reason: unknown }> | undefined;

  constructor(private readonly input: AutomationStudioActionPermissionGateInput) {
    // Only a recognised class is ever a grant. Filtering rather than trusting
    // the caller's type means a grant that reached here with a word Core does
    // not know still permits nothing by it.
    this.permitted = new Set((input.permittedConsequences ?? []).filter(isAutomationStudioActionConsequence));
    this.instructedEntries = input.instructed;
  }

  /** What the instruction was read to ask for: given, derived, or not yet known. */
  get instructed(): readonly AutomationStudioInstructedConsequence[] | undefined {
    return this.instructedEntries;
  }

  /** The first request raised, which is the one the run ends on. */
  get request(): AutomationStudioActionPermissionRequest | undefined {
    return this.raised;
  }

  /** Whether the request was raised for this action: a call, or a plan step. */
  raisedDuring(ref: string): boolean {
    return this.raised !== undefined && this.raisedRef === ref;
  }

  /**
   * Aborted the moment a request is raised. A caller hands it to whatever it
   * runs the actions under, so the run ends at the request wherever the check
   * was called from -- including inside a check the loop cannot see into.
   */
  get signal(): AbortSignal {
    return this.stopped.signal;
  }

  /**
   * Record what the model has been shown, so a later request may quote a name
   * from it. Called with every execution the domain returns, and with any
   * evidence the caller showed the model before the first action.
   */
  observe(execution: JsonValue | AutomationStudioLlmEvidenceToolExecutionResult | undefined): void {
    const pending: unknown[] = [shownValue(execution)];
    const seen = new Set<object>();
    while (pending.length && this.shownCharacters < MAX_SHOWN_CHARACTERS) {
      const item = pending.pop();
      if (typeof item === "string") {
        const text = normalised(item);
        if (text) {
          this.shown.push(text);
          this.shownCharacters += text.length;
        }
        continue;
      }
      if (!item || typeof item !== "object" || seen.has(item)) continue;
      seen.add(item);
      for (const child of Array.isArray(item) ? item : Object.values(item)) pending.push(child);
    }
  }

  /** The check handed to the domain with one action. */
  checkFor(action: AutomationStudioActionPermissionAction): AutomationStudioActionPermissionCheck {
    return async (declaration) => {
      const read = readAutomationStudioActionDeclaration(declaration);
      const instructed = await this.instructedFor();
      const missing = automationStudioConsequencesInOrder(read.consequences.filter((consequence) =>
        !this.permitted.has(consequence) && !instructed.some((entry) => entry.consequence === consequence)));
      if (!missing.length) return { permitted: true };
      if (this.raised) return { permitted: false, missing, requestId: this.raised.requestId };
      const controlName = this.carriedName(read.controlName);
      const stage = this.input.stage;
      this.raised = {
        schemaVersion: AUTOMATION_STUDIO_ACTION_PERMISSION_REQUEST_SCHEMA_VERSION,
        requestId: this.input.newRequestId?.() ?? `permission-request:${randomUUID()}`,
        requestedAtMs: Math.trunc(this.input.now?.() ?? Date.now()),
        action: { kind: action.kind, id: action.id, ref: action.ref, verb: read.verb },
        control: { name: controlName, kind: read.controlKind },
        consequences: automationStudioConsequencesInOrder(read.consequences),
        missing,
        reason: { stage, instructionIds: [...(this.input.instructionIds ?? [])] },
        authority: {
          granted: automationStudioConsequencesInOrder([...this.permitted]),
          instructed: instructed.map((entry) => ({ consequence: entry.consequence, instructionId: entry.instructionId, quote: entry.quote }))
        },
        sentence: automationStudioActionPermissionSentence({ stage, kind: action.kind, verb: read.verb, controlName, controlKind: read.controlKind, missing })
      };
      this.raisedRef = action.ref;
      this.stopped.abort();
      return { permitted: false, missing, requestId: this.raised.requestId };
    };
  }

  /**
   * The instruction's own authority, derived once when first needed.
   *
   * Fail closed. A derivation that failed grants nothing, so the run asks; it
   * is remembered as failed rather than as an answer, so it is not retried
   * mid-run and `instructed` stays unknown -- nothing is stored with the Flow
   * as though the instruction had asked for nothing.
   */
  private async instructedFor(): Promise<readonly AutomationStudioInstructedConsequence[]> {
    if (this.instructedEntries) return this.instructedEntries;
    if (!this.input.deriveInstructed) return NOTHING_INSTRUCTED;
    this.deriving ??= this.input.deriveInstructed().then(
      (entries) => ({ derived: true as const, entries }),
      (reason: unknown) => ({ derived: false as const, reason })
    );
    const outcome = await this.deriving;
    if (!outcome.derived) return NOTHING_INSTRUCTED;
    this.instructedEntries = outcome.entries;
    return outcome.entries;
  }

  /** The name as a request may carry it, or `null` when it was never shown. */
  private carriedName(name: string): string | null {
    if (!this.shown.some((text) => text.includes(name))) return null;
    const bounded = name.length > AUTOMATION_STUDIO_ACTION_PERMISSION_CONTROL_NAME_MAX
      ? `${name.slice(0, AUTOMATION_STUDIO_ACTION_PERMISSION_CONTROL_NAME_MAX - 3).trimEnd()}...`
      : name;
    return isAutomationStudioActionPermissionCarriedName(bounded) ? bounded : null;
  }
}

/**
 * The check for an action run where no run stands behind it, so there is
 * nobody to ask: a caller that drove a domain's option directly. It reads the
 * declaration like any other and permits nothing that has a consequence.
 */
export const automationStudioActionPermissionDenied: AutomationStudioActionPermissionCheck = async (declaration) => {
  const read = readAutomationStudioActionDeclaration(declaration);
  return { permitted: false, missing: automationStudioConsequencesInOrder(read.consequences), requestId: null };
};

function shownValue(execution: JsonValue | AutomationStudioLlmEvidenceToolExecutionResult | undefined): unknown {
  if (execution && typeof execution === "object" && !Array.isArray(execution) && (execution as { kind?: unknown }).kind === "llm_evidence_tool_execution") {
    return (execution as AutomationStudioLlmEvidenceToolExecutionResult).evidence;
  }
  return execution;
}

function normalised(text: string): string {
  return text.replace(/\s+/gu, " ").trim();
}
