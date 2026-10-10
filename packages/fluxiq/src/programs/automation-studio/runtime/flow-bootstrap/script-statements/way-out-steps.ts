// An interruption is dismissed through its way out, never through its offer
// (t423).
//
// R4a's second paid run (`run-mv2pgqkj-f3552c70`) wrote the step that closes a
// promotion the item page raises as `optional: yes`, `consequences: none`, on
// the promotion's own call to action -- "Grab the deal" -- rather than on its
// Close, which the model had itself pressed while exploring. The promotion
// never showed in a trial, so the step was skipped and nothing caught it; had
// it shown, the Flow would have taken the offer. On a real site that accepts,
// buys or joins on the person's behalf, under a declaration that it does
// nothing lasting, which is the one thing the permission gate relies on the
// step to say truthfully.
//
// So a step that is only sometimes needed (`optional: yes`), or that is the
// body of a handler -- the two ways a script answers an interruption -- and
// declares `consequences: none`, is refused when the control it names reads as
// accepting what the interruption offers. It is refused at its `consequences:`
// line, with the way out to use instead and the other answer: when the
// instruction really asks for the act, a step of its own that says what it does.
//
// **What the control's words are.** The domain resolved the step's handle to
// the element it names before this runs, and that identity is on the node as
// `parameters.element` -- its accessible name, else the words it shows, else
// its label, as the trial feedback and the activity cards already read it
// (`../../service/candidate-trial/feedback.ts`, `../../activity/wording/action.ts`).
// A step whose node carries no words is not judged here.
//
// **A small closed list, Core's own.** The extension keeps the vocabulary its
// runtime presses a way out by (`apps/extension/src/content/action-runtime/interference/vocabulary.ts`
// and `press-guard/acting-wording.ts` downstream), as regular expressions in
// browser code that Core never imports and cannot read as data. This list
// mirrors their shape and stays smaller, because a refusal here costs a build a
// decision: a way out is a label that *begins* with one of the phrases that
// mean "go away", or a close glyph alone, and a label that begins so is never
// refused for what follows ("No thanks, I would rather pay full price" closes).
// Anything else is refused only when it carries a word that accepts, agrees,
// confirms, joins, subscribes, signs up, buys, orders, pays now, claims or
// redeems, or begins with a verb that takes an offer (grab, get, claim, shop,
// start, try, add, buy, continue). "Continue without ..." declines and
// "Continue shopping" or "Continue browsing" closes a basket's popup, so both
// are ways out.
//
// **Cookie consent is not an offer.** Accepting cookies moves no money,
// deletes nothing and sends nothing, so under the user's rule it is not a
// risky act, and some banners offer no way to decline. An optional or handler
// step may press a consent banner's accept with `consequences: none`. A step
// is answering a consent banner when its handler's `when:` names a `dialog
// consent` -- the domain's own kind for that layer -- or, with no kind to read,
// when the control's words are a consent answer alone ("Accept all", "Accept
// cookies", "Allow all", "Agree") or accept cookies by name. Words that sign
// up, subscribe, join or buy are refused even there. The guidance still
// prefers the banner's reject or necessary-only answer where it has one.
import type { JsonObject } from "../../../../../core/index.ts";
import type {
  AutomationStudioFlowBootstrapIssueLocator,
  AutomationStudioFlowScript,
  AutomationStudioFlowScriptStep
} from "../authoring/index.ts";
import type { AutomationStudioFlowBootstrapIssue, AutomationStudioFlowBootstrapPlan } from "../plan/index.ts";
import { automationStudioFlowScriptStepSaysOptional } from "./guarded-steps.ts";
import { scriptStatementRefusal } from "./statement-refusal.ts";

/** The code every refusal here is made under. */
const WAY_OUT_ACCEPTS = "flow_script.way_out_accepts";
/** Longer words than this are a container's prose, not a control's name, and are not judged. */
const MAX_CONTROL_WORDS = 80;
/** A label that closes or declines what it sits on, anchored at its start. */
const WAY_OUT = /^(?:close|dismiss|minimi[sz]e|hide|not now|no,? thanks?|no thank you|maybe later|remind me later|later|skip|not interested|continue without|continue shopping|continue browsing|reject|decline|refuse|deny|cancel)(?:$|[\s,.!:;-])/iu;
/** A close glyph as the whole label. */
const CLOSE_GLYPH = /^[×✕✖╳xX]$/u;
/** A word anywhere in the label that takes what the interruption offers. */
const ACCEPTING_WORD = /\b(?:accept|accepts|agree|agrees|allow all|yes|confirm|confirms|join|joins|subscribe|subscribes|sign up|signup|register|buy|buys|purchase|order now|place order|checkout|check out|pay now|claim|claims|redeem|redeems|add to (?:cart|basket|bag))\b/iu;
/** A verb that takes an offer, as the label's first word. */
const ACCEPTING_LEAD = /^(?:grab|get|claim|shop|start|try|add|buy|unlock|activate|enroll|enrol|continue)\b/iu;
/** Words that take an offer even on a consent banner: a sign-up, a purchase, a subscription, a deal. */
const OFFER_WORD = /\b(?:join|joins|subscribe|subscribes|sign up|signup|register|buy|buys|purchase|order|checkout|check out|pay now|claim|claims|redeem|redeems|grab|deal|offer|discount|add to (?:cart|basket|bag))\b/iu;
/** A consent banner's accept, said alone: "Accept all", "Accept cookies", "Allow all", "Agree", "I agree". */
const CONSENT_ANSWER = /^(?:i )?(?:accept|allow|agree)(?: to)?(?: all)?(?: (?:cookies|all cookies|the cookies|and close|and continue))?[.!]?$/iu;
/** A label that accepts cookies by name: "Accept all cookies", "Allow cookies and continue". */
const CONSENT_BY_NAME = /\b(?:accept|allow|agree)\b.*\bcookies?\b|\bcookies?\b.*\b(?:accept|allow|agree)\b/iu;
/** A handler fact naming the domain's consent layer: `dialog consent "<name>"`. */
const CONSENT_DIALOG_FACT = /^dialog\s+consent\b/iu;

/** Why a step answers an interruption: it is optional, or it is a handler's body. */
type Dismissal = { step: AutomationStudioFlowScriptStep; why: "optional" | "handler"; handlerLine?: number; consent?: true };

/**
 * Each step that answers an interruption by pressing a control that accepts
 * its offer while declaring that it causes nothing lasting, as a refusal at
 * its `consequences:` line. Read off the resolved plan, after the domain gave
 * each node its element, and placed through the locator the acceptance built;
 * nothing when the plan came from no script.
 */
export function automationStudioFlowScriptWayOutIssues(input: {
  script: AutomationStudioFlowScript;
  plan: AutomationStudioFlowBootstrapPlan;
  locator: AutomationStudioFlowBootstrapIssueLocator | undefined;
}): AutomationStudioFlowBootstrapIssue[] {
  const dismissals = new Map<number, Dismissal>();
  for (const block of input.script.blocks) {
    for (const step of block.steps) {
      if (step.line <= 0) continue;
      if (block.handler) {
        const consent = (block.when ?? []).some((fact) => !fact.negate && CONSENT_DIALOG_FACT.test(fact.text.trim()));
        dismissals.set(step.line, { step, why: "handler", handlerLine: block.handler.line, ...(consent ? { consent: true as const } : {}) });
      }
      else if (automationStudioFlowScriptStepSaysOptional(step)) dismissals.set(step.line, { step, why: "optional" });
    }
  }
  if (!dismissals.size || !input.locator) return [];
  const issues: AutomationStudioFlowBootstrapIssue[] = [];
  const refused = new Set<number>();
  for (const [subflowIndex, subflow] of input.plan.subflows.entries()) {
    for (const [nodeIndex, node] of subflow.nodes.entries()) {
      // `[]` is `consequences: none`; a step that declared a class is the gate's to ask about.
      if (!Array.isArray(node.consequences) || node.consequences.length) continue;
      const line = input.locator.nodes[`${subflowIndex}.${nodeIndex}`]?.line;
      const dismissal = line === undefined ? undefined : dismissals.get(line);
      if (!dismissal || refused.has(dismissal.step.line)) continue;
      const words = controlWords(node.parameters);
      if (!words || !wordsAccept(words, dismissal.consent === true)) continue;
      refused.add(dismissal.step.line);
      issues.push(scriptStatementRefusal(WAY_OUT_ACCEPTS, message(dismissal, words), consequencesLine(dismissal.step)));
    }
  }
  return issues;
}

/**
 * Whether a control's own words take what an interruption offers, rather than
 * closing it or answering a consent banner (header). `consent` says the step's
 * handler named the domain's consent layer.
 */
function wordsAccept(words: string, consent: boolean): boolean {
  if (CLOSE_GLYPH.test(words)) return false;
  if (WAY_OUT.test(words)) return false;
  if (!OFFER_WORD.test(words) && (consent || CONSENT_ANSWER.test(words) || CONSENT_BY_NAME.test(words))) return false;
  return ACCEPTING_WORD.test(words) || ACCEPTING_LEAD.test(words);
}

/** The words of the element a node targets, from the identity its handle resolved to; nothing when it carries none or only prose. */
function controlWords(parameters: JsonObject | undefined): string | undefined {
  const element = parameters?.element;
  if (!element || typeof element !== "object" || Array.isArray(element)) return undefined;
  const words = [element.accessibleName, element.visibleText, element.label]
    .find((value): value is string => typeof value === "string" && value.trim() !== "")
    ?.replace(/\s+/gu, " ").trim();
  return words && words.length <= MAX_CONTROL_WORDS ? words : undefined;
}

/** The step's `consequences:` line, which is what it got wrong; its own line when the key was spelled some other way. */
function consequencesLine(step: AutomationStudioFlowScriptStep): number {
  return step.entries.find((entry) => /^consequences?$/iu.test(entry.key.trim()))?.line ?? step.line;
}

function message(dismissal: Dismissal, words: string): string {
  const where = dismissal.why === "optional"
    ? `The step at line ${dismissal.step.line} is optional, so it answers something the page only sometimes shows`
    : `The step at line ${dismissal.step.line} is in the handler at line ${dismissal.handlerLine}, so it answers something that got in the way`;
  return `${where}, and it presses ${JSON.stringify(words)}, which takes what that offers, while saying \`consequences: none\`. `
    + "An interruption is dismissed through its way out -- close, no thanks, not now, the X -- never through the control that accepts, joins, buys or continues: on a real site that press takes the offer. "
    + "A cookie banner's accept is not an offer and is allowed. Copy the handle the view printed for its way out instead. If the instruction does ask for that act, make it a step of its own, not optional and not in a handler, and say what it lastingly does on its `consequences:` line.";
}
