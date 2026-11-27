// What the model is told when a person writes.
//
// The panel's vocabulary, rendered once in Core by `panel-capabilities`, so the
// model reads the same list whichever path asked it. Then what only this moment
// knows: the project's Flows by name, and what the person has open. Then the
// answer, in three small shapes, with nothing required that Core can fill in
// itself -- a Flow may be named by its name, arguments the model does not know
// are left out, and the id need not be spelt perfectly.

import { automationStudioPanelCapabilityVocabulary } from "../../../framework/automation-service/panel-capabilities/index.ts";
import { AUTOMATION_STUDIO_CONVERSATION_ANSWER_ASK, AUTOMATION_STUDIO_CONVERSATION_CREATE_HERE, AUTOMATION_STUDIO_CONVERSATION_EXPLORE, AUTOMATION_STUDIO_CONVERSATION_IMPROVE, automationStudioConversationPageShown } from "../commands/index.ts";
import { automationStudioConversationAnswersFirst } from "../commands/answer-first/index.ts";
import type { AutomationStudioConversationDecisionContext } from "./invocation.ts";
import type { AutomationStudioConversationWaitingAsk } from "./waiting-ask.ts";

/**
 * The answer's shapes, and the declaration every answer opens with (t973).
 *
 * With no thinking (t962), Haiku answered two clear jobs typed into the chat -- one that deletes, one
 * that looks something up -- with a reply in words asking whether to start (run-mwoqy6fo-f44d3e98,
 * run-mwos5phg-115e3a15), on requests word for word the same as ones that started on 2026-11-11 with
 * thinking. The text let it: a reply was "when they are not asking for anything to be done", which a
 * model that has decided to be careful does not test itself against; "do not ask whether you may do
 * something ordinary" exempted whatever it judged not ordinary; and a PIN "asked when it is needed"
 * told it there was a gate to respect without saying whose it was. So every answer first declares what
 * the message is (`intent`), a reply is only for conversation, and the one question a dangerous act
 * needs is said to be FluxIQ's own. Core checks the declaration (`./unanswered-task.ts`): a reply to a
 * task, or a reply that declares nothing, is asked for again one rung up.
 *
 * **A task also declares what it will do that lasts, in "acts" (t976).** A dangerous act asks the
 * person one question only when the task starts, never mid-Flow (the user's rule, 2026-11-03 and
 * 2026-11-10), so the attempt needs the classes before anything acts. This reading already happens,
 * so the classes come with it and no call is added for them (`./acts.ts`). The words name what each
 * class covers, in the same terms as the build's own instruction read, and never a site or a task.
 */
const ANSWER_SHAPE = [
  'Answer with one JSON object and nothing else. It first says what their message is, in "intent":',
  '  "task" -- it asks for something to be done or found: on a website, with a Flow, or in the panel. A question whose answer has to be looked up on a site is a task, and so is a job that deletes, pays, sends or posts.',
  '  "conversation" -- it asks for nothing to be done or found: a greeting, thanks, a remark, or a question about FluxIQ itself or about what you can do.',
  "Then, in the same object, one of:",
  '  {"intent": "task", "do": "<capability id>", "with": {"<argument>": "<value>"}, "acts": ["<class>"]}   to do it. Leave out any argument you do not know.',
  '  {"intent": "task", "ask": "<one short question>"}   only when you cannot tell what they want, such as which of several Flows they mean.',
  '  {"intent": "conversation", "reply": "<your answer>"}   only for conversation.',
  `With "do", "acts" lists what the job will do that lasts, from the person's words alone: "move_money" (pays, buys, orders, books with payment, refunds or transfers), "delete" (deletes, removes, withdraws or cancels something so that it is gone), "send_or_publish" (sends, replies, posts, publishes, shares or submits something others will receive or see), "modify_existing" (changes, edits, moves, marks or saves changes to something already there), "create_new" (adds or makes something new that stays). Give every class the words ask for, and [] when the job only looks, reads or finds.`,
  'With "do", also give "process": null only for a job with no data answer; otherwise one object declaring the requested data conditions, order, limit and displayed columns. {} is a valid data declaration with no additional criteria. Do not omit it or invent conditions the person did not ask for.',
  'Use the existing row-processing keys: where [{field, is: "present"|"absent", atLeast, atMost, lessThan, greaterThan, within, equals, contains, startsWith, endsWith, matches, not}], anyOf [[conditions], ...] (a row passes when every condition of any one group holds), compare [{field, lessThan: otherField}], derive [{id, from, pattern, as: "number"|"date"|"text"}], dedupe {by: [fields]}, sort [{field, order: "asc"|"desc", as: "number"|"date"|"text"}], limit, minRows, columns. Bounds compare numbers or written dates (as: "date"); within names a duration such as "7 days". Only include the keys that express the request.',
  'Field references initially use the exact concepts or column names in the request; the attempt binds them to real captured fields. Keep hidden filter and sort fields in the data even when columns shows fewer fields. Declare all requested conditions once; the data layer applies them automatically on every run. Never supply declaration, source, revision or bindings metadata.',
  "A task is never answered with a reply. Start it with the capability that does it, and give it a full effort: start it even when you are unsure how the site is laid out or whether it will work, because the attempt reads the site itself and reports what it found. Ask instead only when it is truly impossible to tell what they want.",
  "Choose the capability that does all of what was asked: when they ask for something to be run, choose the one that runs it, not one that only gets it ready.",
  "Leave projectId out: it is always this project. A Flow goes in flowId, and can be given by its name; FluxIQ finds its id.",
  "Never ask whether you may start, and never ask for or supply a PIN or a password: asking for the job is the person's permission. When a job deletes something, moves money, sends or posts, FluxIQ itself asks the person once, in plain words, as the attempt starts; that question is never yours to ask."
].join("\n");

/**
 * What the bound domain's text is, to the chat's model. It is written for the attempt that works on the
 * site and says "you operate a real website"; read as the chat's own, it told a model with no page in
 * front of it that it had not read the person's page yet (run-mwos5phg-115e3a15, t973).
 */
const DOMAIN_LEAD = "What follows is what the attempt you start is told about working on the site. You see no page here and need not read one: the attempt does that.";

/**
 * The system message for one person's message.
 *
 * `domainInstructions` is the bound domain's own text
 * (`AutomationStudioLlmEvidenceRuntimeBinding.systemInstructions`), already
 * checked when the runtime was bound. It goes after the panel's vocabulary --
 * Core's fixed list of what may be chosen -- and before what only this message
 * knows: the project's Flows and what is on screen. The answer-shape rules
 * stay last and stay Core's; nothing the domain writes replaces them. Absent,
 * the message is exactly what it was.
 */
export function automationStudioConversationInstructions(
  context: AutomationStudioConversationDecisionContext,
  notes: { transcriptWithheld: boolean; domainInstructions?: string | undefined }
): string {
  const sections = [automationStudioPanelCapabilityVocabulary(context.capabilities), ...(notes.domainInstructions ? ["", `${DOMAIN_LEAD}\n${notes.domainInstructions}`] : []), "", flowSection(context), "", onScreenSection(context)];
  const waiting = waitingAsksSection(context);
  if (waiting) sections.push("", waiting);
  const building = buildContinuationGuidance(context);
  if (building) sections.push("", building);
  if (notes.transcriptWithheld) sections.push("", "The earlier part of this conversation could not be read just now, so only the latest message is shown.");
  sections.push("", ANSWER_SHAPE);
  return sections.join("\n");
}

/**
 * The questions still waiting for the person, each with its id, and how to
 * answer one (A10b). With more than one waiting, `ask.answer` refuses an
 * answer that names none, so the model is shown the ids it must name -- and
 * told they are for it alone, because the thread keeps no codes (t276) and
 * the person never sees one. The example is a library's, a kind of site no
 * realistic scenario uses, so it teaches the choosing and not a task.
 */
function waitingAsksSection(context: AutomationStudioConversationDecisionContext): string | null {
  const asks = context.waitingAsks ?? [];
  if (!asks.length) return context.waitingAsksWithheld ? "Whether any question FluxIQ asked is still waiting could not be read just now. If their message answers one, leave askId out; FluxIQ says so when it cannot tell which." : null;
  const lines = [
    `${asks.length === 1 ? "One question FluxIQ asked in this conversation is" : `${asks.length} questions FluxIQ asked in this conversation are`} still waiting for the person's answer, oldest first, each after its id:`,
    ...asks.map((ask) => `  - [${ask.askId}] ${waitingAskLine(ask)}`)
  ];
  const answer = AUTOMATION_STUDIO_CONVERSATION_ANSWER_ASK.capability.id;
  if (context.capabilities.some((capability) => capability.id === answer)) {
    lines.push(
      `When their message answers one of these, choose ${answer}, pass their words as answer, and put the id of the question it answers in askId.${asks.length > 1 ? " With more than one waiting, an answer without askId settles nothing." : ""}`,
      "Choose the question by what the message is about: an option it names answers the choice that offers that option; a yes or a no answers the yes-or-no question about the thing it mentions, or the only yes-or-no question waiting when it mentions nothing.",
      'For example, with a yes-or-no question "Shall I renew the borrowed atlas?" and a choice between "North branch" and "Harbour branch" waiting, "the Harbour one" answers the choice and "yes, renew it" answers the renewal.',
      "When you cannot tell which question they are answering, ask which one, naming the questions by their own words."
    );
  }
  lines.push("The ids are for you alone: never write one in a reply or a question, because the person never sees them.");
  return lines.join("\n");
}

/** One waiting question as the model reads it: the words the person read, and what kind of answer it takes. */
function waitingAskLine(ask: AutomationStudioConversationWaitingAsk): string {
  const about = ask.about ? ` about ${ask.about}` : "";
  const kind = ask.kind === "choice"
    ? `a choice${about} between ${ask.options.map((option) => `"${option}"`).join(", ")}`
    : ask.kind === "open" ? `a question${about} that takes their own words` : `a yes-or-no question${about}`;
  return ask.question ? `"${ask.question}" (${kind})` : kind;
}

/** Describe only existing offered commands; the service checks target and draft eligibility. */
function buildContinuationGuidance(context: AutomationStudioConversationDecisionContext): string {
  const offered = (id: string) => context.capabilities.some((capability) => capability.id === id);
  const lines = ["A Flow's name alone does not prove it already does the requested job. Use what the conversation actually established; ask which Flow when the intended one is ambiguous."];
  if (offered(AUTOMATION_STUDIO_CONVERSATION_EXPLORE.capability.id)) {
    lines.push("When they ask to continue or finish an unfinished creation, choose flow.explore for that Flow and omit instruction to use its saved goal. Never promise that it picks up from saved steps: the service alone decides whether earlier work can be used, from the exact task, and its answer says what was used. A genuinely changed goal goes in instruction and counts as a new task. Repeating the same task is not by itself a request to change its saved goal.");
  }
  if (offered(AUTOMATION_STUDIO_CONVERSATION_IMPROVE.capability.id)) {
    lines.push("Changing a Flow with applied steps uses flow.improve, which works out a change and asks the person before applying it. An unfinished creation is not an applied Flow to improve.");
  }
  if (offered(AUTOMATION_STUDIO_CONVERSATION_CREATE_HERE.capability.id)) {
    lines.push("An explicit request for a separate new automation uses flow.createHere; continuing an existing unfinished Flow does not create another one.");
  }
  return lines.join("\n");
}

function flowSection(context: AutomationStudioConversationDecisionContext): string {
  if (context.flows === null) return "The project's Flows could not be listed just now. If the person names one, pass the name on as they wrote it.";
  if (!context.flows.length) return "This project has no Flows yet.";
  // Every Flow (2026-09-30): it was the first 60 and a count of the rest.
  const lines = context.flows.map((flow) => `  - ${flow.name} (${flow.flowId})`);
  return ["The Flows in this project:", ...lines].join("\n");
}

function onScreenSection(context: AutomationStudioConversationDecisionContext): string {
  const open = context.onScreen;
  const flow = open.flowId ? context.flows?.find((entry) => entry.flowId === open.flowId) : undefined;
  const parts = [
    open.flowId ? `the Flow ${flow ? `"${flow.name}" ` : ""}(${open.flowId})` : "",
    open.subflowId ? `the part ${open.subflowId}` : "",
    open.runId ? `the run ${open.runId}` : "",
    open.recordingId ? `the recording ${open.recordingId}` : ""
  ].filter(Boolean);
  // Origin and path only: a query or fragment is where a page keeps a search,
  // a session or a token, and none of that says which page this is.
  const page = automationStudioConversationPageShown(open.pageUrl);
  const pageLine = page ? `\nIn their browser they are on the page ${page}. Something they ask to be made "here" or "for this page" starts there.${describedJobLine(context)}` : "";
  return (parts.length
    ? `The person has ${parts.join(", ")} open, so "it" or "this" most likely means that.`
    : "The person has nothing in particular open, so if they say \"it\" or \"this\" without naming a Flow, and the conversation has not named one, ask which Flow they mean rather than choosing one.") + pageLine;
}

/**
 * What a job described for the open site is: a request to build one from the
 * page. A person on a shopping site who types "Find every pair of wireless
 * earbuds under $50 ..." has asked for an automation and said what it should
 * do, in one message, without saying "automate" -- and the model, told only
 * that something asked to be made "here" starts here, was left to guess
 * between building it, replying, and exploring a Flow the project does not
 * have. Said only when the capability is offered, so the model is never told
 * to choose one it cannot.
 */
function describedJobLine(context: AutomationStudioConversationDecisionContext): string {
  const createHere = AUTOMATION_STUDIO_CONVERSATION_CREATE_HERE.capability.id;
  if (!context.capabilities.some((capability) => capability.id === createHere)) return "";
  if (automationStudioConversationAnswersFirst()) return ` ${answerFirstJobLine(createHere)}`;
  return ` A job they describe for this site -- something to find, list, collect, fill in or buy on it -- that no Flow above already does is a request to make a new automation from this page: choose ${createHere} and pass their whole message, in their own words, as its instruction.`;
}

/**
 * The same, in answer-first mode, where a described job is a task and the same words again start it
 * through create-here (t869), which finds the Flow the task already has. "That no Flow above already
 * does" read, to a smaller model, as "a Flow above does it, so run it": Haiku answered the same words
 * typed again with `run.execute` on the task's own Flow (run-mw9xfwvd-ccc692b2, t885), where Sonnet
 * chose create-here on the same text. So this says outright that a Flow made from the same words
 * changes nothing, and that describing a job is never a request to run a Flow.
 */
function answerFirstJobLine(createHere: string): string {
  return `A job they describe for this site -- something to find, check, list, collect, fill in, change, remove or buy on it -- is a task to do from this page: choose ${createHere} and pass their whole message, in their own words, as its instruction. They need not open any particular page first: it starts here and goes wherever on the site the job needs. That holds just the same when a Flow above was made from the same words before: ${createHere} finds that Flow, does the task with what it kept, and returns the result. A job described again is never a request to run a Flow; run one only when they ask for a Flow to be run without describing a job.`;
}
