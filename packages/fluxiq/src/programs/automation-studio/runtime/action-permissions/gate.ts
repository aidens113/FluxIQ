// Where Core decides, for one run, whether the action a domain is about to
// take is one a person allowed.
//
// One gate per run. It holds the consequences the run is permitted, sees
// every piece of evidence the domain hands back, and hands the domain a check
// with every action. The first action whose consequences the run does not hold
// raises a request, and the gate records it.
//
// **What it can refuse is narrow, deliberately.** Only a destructive class --
// spending money, changing what already exists, deleting -- is ever refused,
// and only when neither the person's instruction nor their permission asked for it.
// Making something new and sending what the instruction said to send are not
// the gate's to refuse at all; see `destructive.ts` for why, and for the days
// of live builds that ended asking a person for permission to put an item in a
// basket. Everything is still declared and still recorded: what narrowed is
// what stops a run, not what the run has to say about itself.
//
// **What the caller then does with that request is the caller's, and there are
// two answers.** A caller that has nowhere to put the question ends the run on
// it -- `endsOnRequest`, which is the default and aborts `signal` so the run
// stops wherever the check was called from. A caller that can put it to a
// person parks instead: it opens the request as an ask, waits, and calls
// `settle` with what came back. A granted request widens what this run holds
// and lets the work go on. One nobody answered stays in force, so every later
// check reports that same refusal and the run never waits on an absent person
// twice. A person's explicit no is remembered for that question alone -- the
// same control, the same kind, the same classes -- and a different question
// raises a request of its own (t195-w18: one declined press on "Continue to
// checkout" used to refuse "Place order", the press the task needed, unasked).
//
// **Fail closed.** No permitted set, an empty one and one naming something Core
// does not recognise all permit nothing. There is no consequence the gate
// assumes is fine, and no path through it that permits an action whose
// declaration it could not read -- that throws, and the action fails.
//
// **Every declaration is kept, not only the refused ones.** A permitted action
// used to leave nothing behind but the absence of a refusal, so the only way to
// learn what a step had said about itself was to deduce it from what was not
// refused -- which is exactly how four live builds came to publish Flows
// containing presses with nobody able to say what any press declared. The gate
// now records each declaration as it read it, with its own answer beside it
// (`declared.ts`), and a caller publishes them with whatever the run produced.
//
// **Nothing past the evidence boundary.** The request carries the control's
// name only when that name already appears in evidence this run returned to the
// model. A name the gate cannot find there -- a locator, a fragment of markup,
// an internal id, text the model never saw -- is withheld, and the request says
// "a control it cannot name here" instead. Withheld, not refused: the person is
// still asked, with the action, the consequence and the reason intact, and
// nothing new leaves the domain to ask them. The gate keeps a bounded amount of
// what was shown, forgetting the oldest first, so a name shown only long ago
// may be withheld and a name on the page in front of the model never is.

import { randomUUID } from "node:crypto";
import type { JsonValue } from "../../../../core/index.ts";
import type { AutomationStudioLlmEvidenceToolExecutionResult } from "../llm/index.ts";
import { automationStudioConsequencesInOrder, isAutomationStudioActionConsequence, type AutomationStudioActionConsequence } from "./consequences.ts";
import { automationStudioDestructiveConsequences } from "./destructive.ts";
import { AUTOMATION_STUDIO_ACTION_DECLARATIONS_MAX, type AutomationStudioActionDeclarationRecord } from "./declared.ts";
import { readAutomationStudioActionDeclaration, type AutomationStudioActionPermissionCheck, type AutomationStudioActionPermissionVerdict } from "./declaration.ts";
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

/**
 * How much shown text a gate keeps to find names in. Past it, the text shown
 * longest ago is forgotten first, so what the model saw most recently -- the
 * page it is acting on -- can always be named. Until t195-w20g the gate stopped
 * recording at the budget instead, so on a long build the last control shown,
 * "Place order", was asked about unnamed and a person was right to refuse it.
 */
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
  /**
   * Whether raising a request ends the run: `signal` fires and the caller
   * stops. Absent means yes, which is the behaviour every caller had before a
   * question could reach anybody. A caller that passes `false` is saying it
   * will put the request to a person and `settle` it, and is responsible for
   * what happens if nobody answers.
   */
  endsOnRequest?: boolean | undefined;
  now?: (() => number) | undefined;
  newRequestId?: (() => string) | undefined;
};

export class AutomationStudioActionPermissionGate {
  private readonly permitted: Set<AutomationStudioActionConsequence>;
  /**
   * Every distinct string shown, normalised, oldest first. A string shown again
   * moves to the newest end rather than counting twice, so a header and footer
   * on every page cost the budget once and are never the first forgotten.
   */
  private readonly shown = new Set<string>();
  private shownCharacters = 0;
  private readonly records: AutomationStudioActionDeclarationRecord[] = [];
  /** Raised and not declined: still waiting, or nobody answered. While it stands, no new request is raised. */
  private outstanding: AutomationStudioActionPermissionRequest | undefined;
  /** The request the latest refusal carried: the one the run ends on, or is proposed with. */
  private latest: AutomationStudioActionPermissionRequest | undefined;
  /** The control each raised request was about, by request id, so a decline can be remembered against it. */
  private readonly askedAbout = new Map<string, { controlName: string; controlKind: string | null }>();
  /** Questions a person answered no, each with the control it was asked about. */
  private readonly declined: Array<{ request: AutomationStudioActionPermissionRequest; controlName: string; controlKind: string | null }> = [];
  /** The declined request, while a no is the last word on a lasting act (see `standingDecline`). */
  private lastDeclined: AutomationStudioActionPermissionRequest | undefined;
  private readonly stopped = new AbortController();
  private instructedEntries: readonly AutomationStudioInstructedConsequence[] | undefined;
  private deriving: Promise<{ derived: true; entries: readonly AutomationStudioInstructedConsequence[] } | { derived: false; reason: unknown }> | undefined;

  constructor(private readonly input: AutomationStudioActionPermissionGateInput) {
    // Only a recognised class is ever permitted. Filtering rather than trusting
    // the caller's type means a permitted set that reached here with a word Core does
    // not know still permits nothing by it.
    this.permitted = new Set((input.permittedConsequences ?? []).filter(isAutomationStudioActionConsequence));
    this.instructedEntries = input.instructed;
  }

  /** What the instruction was read to ask for: given, derived, or not yet known. */
  get instructed(): readonly AutomationStudioInstructedConsequence[] | undefined {
    return this.instructedEntries;
  }

  /**
   * What every action put to this gate declared, in the order it was asked,
   * with Core's own answer beside it. A caller publishes these so a step's
   * self-report can be read rather than deduced.
   */
  get declarations(): readonly AutomationStudioActionDeclarationRecord[] {
    return this.records;
  }

  /**
   * The instruction's authority, forced now rather than when an action first
   * needs it. For a caller that has to compare what was declared against what
   * the instruction asks for, and would otherwise never derive it at all --
   * because a run whose every action declared nothing lasting never asks.
   */
  resolveInstructed(): Promise<readonly AutomationStudioInstructedConsequence[]> {
    return this.instructedFor();
  }

  /**
   * The request the run ends on, and the one stored with whatever it produced.
   * Until a person declines something it is the first request raised. A
   * declined request is carried only while a step of the Flow itself needs it:
   * a `flow_step` refused as declined puts it back. An exploration press of a
   * declined control is refused without carrying it, because the person has
   * answered and the build may still finish another way -- carrying it made
   * every later stalled round end as that question, and made a finished Flow
   * that never presses that control unapprovable
   * (`flow-bootstrap/adaptation.ts`, `assertAutomationStudioBootstrapPermissionRequestAnswered`).
   */
  get request(): AutomationStudioActionPermissionRequest | undefined {
    return this.latest;
  }

  /**
   * The request a person declined, while that no is still the last word this
   * run had on a lasting act: set when a person declines, and again whenever
   * the declined question is refused unasked; cleared only by a grant, which
   * is the person allowing a different way forward.
   *
   * `request` stops carrying a decline the moment it is answered, so a run can
   * go on and ask about another control. That is right for the asking and
   * wrong for whatever the run would build afterwards: a recovery whose
   * exploration ended with a person's no standing must not go on to a repair,
   * because that repair is built around the act the person refused
   * (t229: after 2a5ad68c the patch call ran straight after a deny).
   */
  get standingDecline(): AutomationStudioActionPermissionRequest | undefined {
    return this.lastDeclined;
  }

  /**
   * Take the answer to the request this gate raised and has not settled.
   *
   * `granted` adds exactly the classes the request said were missing, and
   * forgets the request, so the same check asked again permits the action and a
   * later action wanting something else can raise a request of its own. Nothing
   * beyond `missing` is permitted: an answer widens the run by what was asked
   * about and by nothing else.
   *
   * `declined` is a person saying no. It is remembered for that question --
   * the same control name and kind, asked about the same classes -- which is
   * refused from then on without asking, carrying this request's id and
   * `declined: true`. It no longer stands in front of other questions: a
   * different control, or the same one asked about other classes, raises a new
   * request. A later grant of the same classes on another control does not lift
   * it; the person refused this control by name.
   *
   * `unanswered` -- a timeout, a thread that could not be reached, a wait that
   * was cancelled -- keeps the request in force. It is then what every later
   * refusal reports and no new request is raised, so a run nobody is watching
   * waits once, not once per action.
   *
   * Only for a caller that set `endsOnRequest: false`; a caller that ended on
   * the request has nothing to settle.
   */
  settle(answer: "granted" | "declined" | "unanswered"): void {
    const settled = this.outstanding;
    // Only the two answers a person gives settle anything. Anything else -- an
    // unanswered request, or a word this gate does not know -- keeps the
    // request in force: a permission gate never grants by default.
    if (!settled || (answer !== "granted" && answer !== "declined")) return;
    this.outstanding = undefined;
    const control = this.askedAbout.get(settled.requestId);
    if (answer === "declined") {
      if (control) this.declined.push({ request: settled, ...control });
      this.lastDeclined = settled;
      // Answered, so no longer what the run stands on; a Flow step that needs it puts it back.
      if (this.latest === settled) this.latest = undefined;
      return;
    }
    this.lastDeclined = undefined;
    for (const consequence of settled.missing) this.permitted.add(consequence);
    if (this.latest === settled) this.latest = undefined;
  }

  /** Whether the request the run carries was raised for this action: a call, or a plan step. */
  raisedDuring(ref: string): boolean {
    return this.latest !== undefined && this.latest.action.ref === ref;
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
    while (pending.length) {
      const item = pending.pop();
      if (typeof item === "string") {
        const text = normalised(item);
        if (!text) continue;
        if (this.shown.delete(text)) this.shownCharacters -= text.length;
        this.shown.add(text);
        this.shownCharacters += text.length;
        continue;
      }
      if (!item || typeof item !== "object" || seen.has(item)) continue;
      seen.add(item);
      for (const child of Array.isArray(item) ? item : Object.values(item)) pending.push(child);
    }
    // Forget the oldest first. The newest string is always kept, even alone
    // over the budget: it is what the model is looking at now.
    for (const oldest of this.shown) {
      if (this.shownCharacters <= MAX_SHOWN_CHARACTERS || this.shown.size <= 1) break;
      this.shown.delete(oldest);
      this.shownCharacters -= oldest.length;
    }
  }

  /** The check handed to the domain with one action. */
  checkFor(action: AutomationStudioActionPermissionAction): AutomationStudioActionPermissionCheck {
    return async (declaration) => {
      const read = readAutomationStudioActionDeclaration(declaration);
      const named = automationStudioConsequencesInOrder(read.consequences);
      // An action that only reads leaves nothing behind to permit, so what it
      // named cannot be a lasting consequence and is not treated as one. The
      // words are kept as `disregarded` rather than thrown away, because a
      // model calling a page read `create_new` is a fact about the guidance
      // worth being able to count.
      const observes = read.effect === "observe";
      const consequences = observes ? [] : named;
      const disregarded = observes ? named : [];
      const controlName = this.carriedName(read.controlName);
      const record = (verdict: AutomationStudioActionPermissionVerdict): AutomationStudioActionPermissionVerdict => {
        if (this.records.length < AUTOMATION_STUDIO_ACTION_DECLARATIONS_MAX) {
          // Every field by name, and an absent one omitted rather than spread
          // in: this record travels to a person and to a stored proposal, so a
          // renamed field must be a compile error here.
          const entry: AutomationStudioActionDeclarationRecord = {
            action: { kind: action.kind, id: action.id, ref: action.ref, verb: read.verb, effect: read.effect },
            control: { name: controlName, kind: read.controlKind },
            consequences: [...consequences],
            permitted: verdict.permitted
          };
          if (!verdict.permitted) entry.missing = [...verdict.missing];
          if (!verdict.permitted && verdict.requestId !== null) entry.requestId = verdict.requestId;
          if (disregarded.length) entry.disregarded = [...disregarded];
          this.records.push(entry);
        }
        return verdict;
      };
      // An action that says it causes nothing lasting is permitted without
      // reading the instruction: there is nothing to permit, and a run whose
      // every action answers this way must not be charged for a derivation it
      // has no use for. It is still recorded, which is the whole point -- the
      // empty answer is the one nobody could see. A read reaches this line the
      // same way, having had nothing lasting to declare in the first place.
      if (!consequences.length) return record({ permitted: true });
      // The instruction is read whenever an action declares anything lasting,
      // whether or not this action could be refused: it is stored with the
      // Flow, and a run that only ever made things would otherwise never derive
      // it at all.
      const instructed = await this.instructedFor();
      // Only a gated class can stop anything (`destructive.ts`): moving money,
      // deleting, sending or publishing. Making or editing something is never
      // the gate's to refuse. A gated class is asked about unless a person
      // permitted it -- the instruction asking for it is recorded, and is not a
      // permission (the user's rule, `docs/working/mvp-today-plan.md:150`:
      // these acts independently require a person's authority; until
      // 2026-09-30 an instructed class went ahead unasked, so whether Place
      // order asked depended on how the model happened to read the instruction).
      // A question a person already answered no is not asked again, and is not
      // answered from what the run was granted since either: the person
      // refused this control by name. It is the same question when the control
      // is, and the action still declares every class they refused.
      const gated = automationStudioDestructiveConsequences(consequences);
      const declined = this.declined.find((entry) => entry.controlName === read.controlName
        && entry.controlKind === read.controlKind
        && entry.request.missing.every((consequence) => gated.includes(consequence)));
      if (declined) {
        // Only a step of the Flow makes the run stand on it again (see `request`).
        if (action.kind === "flow_step") this.latest = declined.request;
        // Tried again after the no: the no is the last word once more.
        this.lastDeclined = declined.request;
        return record({ permitted: false, missing: [...declined.request.missing], requestId: declined.request.requestId, declined: true });
      }
      const missing = automationStudioDestructiveConsequences(consequences.filter((consequence) => !this.permitted.has(consequence)));
      if (!missing.length) return record({ permitted: true });
      if (this.outstanding) {
        this.latest = this.outstanding;
        return record({ permitted: false, missing, requestId: this.outstanding.requestId });
      }
      const stage = this.input.stage;
      const raised: AutomationStudioActionPermissionRequest = {
        schemaVersion: AUTOMATION_STUDIO_ACTION_PERMISSION_REQUEST_SCHEMA_VERSION,
        requestId: this.input.newRequestId?.() ?? `permission-request:${randomUUID()}`,
        requestedAtMs: Math.trunc(this.input.now?.() ?? Date.now()),
        action: { kind: action.kind, id: action.id, ref: action.ref, verb: read.verb },
        control: { name: controlName, kind: read.controlKind },
        consequences: [...consequences],
        missing,
        reason: { stage, instructionIds: [...(this.input.instructionIds ?? [])] },
        authority: {
          granted: automationStudioConsequencesInOrder([...this.permitted]),
          instructed: instructed.map((entry) => ({ consequence: entry.consequence, instructionId: entry.instructionId, quote: entry.quote }))
        },
        sentence: automationStudioActionPermissionSentence({ stage, kind: action.kind, verb: read.verb, controlName, controlKind: read.controlKind, missing })
      };
      this.outstanding = this.latest = raised;
      // The name as the domain gave it, not as the request carries it: two
      // controls whose names were both withheld are still two questions.
      this.askedAbout.set(raised.requestId, { controlName: read.controlName, controlKind: read.controlKind });
      if (this.input.endsOnRequest !== false) this.stopped.abort();
      return record({ permitted: false, missing, requestId: raised.requestId });
    };
  }

  /**
   * The instruction's own authority, derived once when first needed.
   *
   * Fail closed. A derivation that failed permits nothing, so the run asks; it
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

  /** Whether the name appears in anything the model was shown and the gate still keeps. */
  private wasShown(name: string): boolean {
    if (this.shown.has(name)) return true;
    for (const text of this.shown) if (text.includes(name)) return true;
    return false;
  }

  /** The name as a request may carry it, or `null` when it was never shown. */
  private carriedName(name: string): string | null {
    if (!this.wasShown(name)) return null;
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
  // Nothing declared is nothing to refuse. Refusing it here would make an
  // action that honestly says it causes nothing the one answer that cannot be
  // given, which is the incentive this whole seam exists to remove. An action
  // that only reads is the same case: there is nothing it could have done that
  // outlasts it, so there is nobody who would need to be asked.
  if (read.effect === "observe") return { permitted: true };
  // Nor is there anybody to ask about making or editing something: those are
  // not gated anywhere (`destructive.ts`), so having no run behind the action
  // changes nothing about them. What it changes is that a gated class has no
  // person who could have permitted it, and no request to raise.
  const missing = automationStudioDestructiveConsequences(read.consequences);
  if (!missing.length) return { permitted: true };
  return { permitted: false, missing, requestId: null };
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
