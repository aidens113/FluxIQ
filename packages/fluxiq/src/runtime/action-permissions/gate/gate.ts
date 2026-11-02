import type { AutomationStudioActionConsequence } from "../../../components/automation/action-effect/consequences/index.ts";
import type { AutomationStudioActionDeclarationRecord, AutomationStudioActionPermissionRequest, AutomationStudioInstructedConsequence, AutomationStudioActionPermissionAction, AutomationStudioActionPermissionCheck, AutomationStudioActionPermissionVerdict } from "../../../flows/executable/permissions/index.ts";
import type { AutomationStudioActionPermissionGateInput } from "./input.ts";
import { isAutomationStudioActionConsequence, automationStudioConsequencesInOrder } from "../../../components/automation/action-effect/consequences/index.ts";
import { shownValue } from "./evidence.ts";
import { normalised } from "./normalise.ts";
import { beginAutomationStudioActionAssessment } from "../assessment/index.ts";
import { readAutomationStudioActionDeclaration } from "../declaration/index.ts";
import { automationStudioActionPermissionProjection } from "../declaration/index.ts";
import { automationStudioActionAssessmentEffect } from "../assessment/index.ts";
import { AUTOMATION_STUDIO_ACTION_DECLARATIONS_MAX } from "../record/index.ts";
import { automationStudioDestructiveConsequences } from "../destructive/index.ts";
import { AUTOMATION_STUDIO_ACTION_PERMISSION_REQUEST_SCHEMA_VERSION } from "../../../flows/executable/permissions/index.ts";
import { AUTOMATION_STUDIO_ACTION_PERMISSION_CONTROL_NAME_MAX, isAutomationStudioActionPermissionCarriedName } from "../request.ts";
import { randomUUID } from "node:crypto";
import { permissionConstants } from "./constants.ts";
const { NOTHING_INSTRUCTED, MAX_SHOWN_CHARACTERS } = permissionConstants;
import type { ActionPermissionPresenter } from "./presenter.ts";

export class ActionPermissionGate {
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

  constructor(private readonly input: AutomationStudioActionPermissionGateInput, private readonly presentRequest: ActionPermissionPresenter) {
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
  observe(execution: unknown): void {
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

  /**
   * A control's name as this gate would carry it to a person now: bounded,
   * or `null` when the model was never shown it. For a caller that reports
   * what an action declared beside the gate's own record (t462's site-reset
   * ledger), so the name obeys the same evidence rule there.
   */
  carriedControlName(name: string): string | null {
    return this.carriedName(name.replace(/\s+/gu, " ").trim());
  }

  /** The check handed to the domain with one action. */
  checkFor(action: AutomationStudioActionPermissionAction): AutomationStudioActionPermissionCheck {
    return async (declaration) => {
      const assessment = beginAutomationStudioActionAssessment(action);
      const read = readAutomationStudioActionDeclaration(declaration);
      // An action that only reads leaves nothing behind to permit, so what it
      // named cannot be a lasting consequence and is not treated as one. The
      // words are kept as `disregarded` rather than thrown away, because a
      // model calling a page read `create_new` is a fact about the guidance
      // worth being able to count.
      const projection = automationStudioActionPermissionProjection(read);
      const { effect, consequences, disregarded } = projection;
      const observedEffect = automationStudioActionAssessmentEffect(read, projection);
      const controlName = this.carriedName(read.controlName);
      const record = (verdict: AutomationStudioActionPermissionVerdict): AutomationStudioActionPermissionVerdict => {
        assessment.settle({ effect: observedEffect, permitted: verdict.permitted });
        if (this.records.length < AUTOMATION_STUDIO_ACTION_DECLARATIONS_MAX) {
          // Every field by name, and an absent one omitted rather than spread
          // in: this record travels to a person and to a stored proposal, so a
          // renamed field must be a compile error here.
          const entry: AutomationStudioActionDeclarationRecord = {
            action: { kind: action.kind, id: action.id, ref: action.ref, verb: read.verb, effect },
            control: { name: controlName, kind: read.controlKind },
            consequences: [...consequences],
            permitted: verdict.permitted
          };
          if (!verdict.permitted) entry.missing = [...verdict.missing];
          if (!verdict.permitted && verdict.requestId !== null) entry.requestId = verdict.requestId;
          if (disregarded.length) entry.disregarded = [...disregarded];
          if (action.undoes) entry.undoes = action.undoes.act;
          this.records.push(entry);
        }
        return verdict;
      };
      // A host's private repeat scope can only refuse; ordinary permission still decides every other action.
      if (assessment.veto(observedEffect)) return record({ permitted: false, missing: [], requestId: null });
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
      // Undoing an act this build made may do what its ledger allowed, for
      // this one action: the classes are held here and never join `permitted`,
      // so the next action -- on anything that was there before the build --
      // is asked about exactly as before (t462). A decline above still wins.
      const undoing = new Set((action.undoes?.allowed ?? []).filter(isAutomationStudioActionConsequence));
      const missing = automationStudioDestructiveConsequences(consequences.filter((consequence) => !this.permitted.has(consequence) && !undoing.has(consequence)));
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
        sentence: this.presentRequest({ stage, kind: action.kind, verb: read.verb, controlName, controlKind: read.controlKind, missing })
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
