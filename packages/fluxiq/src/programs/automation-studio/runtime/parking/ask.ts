// The ask, as the runtime raises it.
//
// There is one ask in Core and it is the conversation's: the thread owns the
// question, and everything here is a view of that one model rather than a
// second one. So the kinds, the statuses, the option, the routes and the
// timeout action are imported, not redeclared, and `AutomationStudioAsk` is
// literally what the conversation store accepts (`...AskInput`) plus the three
// things a live run holds and a stored row does not: how the question stands
// while it is being asked, what it says, and where in the run it came from.
//
// That is what lets the parking port hand an ask straight to the thread with
// nothing translated: a renamed or retyped field on the durable ask is a
// compile error here, where before it was a silent divergence between two
// records of the same question.

import type {
  AutomationStudioConversationAskControl,
  AutomationStudioConversationAskInput,
  AutomationStudioConversationAskKind,
  AutomationStudioConversationAskOption,
  AutomationStudioConversationAskRoutes,
  AutomationStudioConversationAskStatus,
  AutomationStudioConversationAskTimeoutAction
} from "../conversations/index.ts";

/** What an ask wants back from the person. */
export type AutomationStudioAskKind = AutomationStudioConversationAskKind;
/** Pending until it is answered or runs out of time. */
export type AutomationStudioAskStatus = AutomationStudioConversationAskStatus;
/** One answer a `choice` ask offers, and the route taking it resumes the run down. */
export type AutomationStudioAskOption = AutomationStudioConversationAskOption;
/** What the ask acts on, as the person would recognise it. */
export type AutomationStudioAskControl = AutomationStudioConversationAskControl;
/** What happens to a parked ask nobody answered. */
export type AutomationStudioAskTimeoutAction = AutomationStudioConversationAskTimeoutAction;

/**
 * Where each way of settling an ask resumes the run: `granted` for a grant, a
 * free-text answer or a chosen option with no route of its own, `denied` for a
 * refusal, `timedOut` for nobody answering. A null route is one the ask did
 * not name.
 */
export type AutomationStudioAskRoutes = AutomationStudioConversationAskRoutes;

/**
 * The same three routes with every gap filled in, which is what a parked run
 * holds. Derived from the ask's own routes rather than written out again, so a
 * route added to the ask is a route a parked run must resolve.
 */
export type AutomationStudioResolvedAskRoutes = { [Route in keyof AutomationStudioAskRoutes]-?: string };

/** Where in the product's work the ask was raised, so a surface can say what is waiting. */
export type AutomationStudioAskStage = "execution" | "authoring" | "recovery";

/**
 * A question Core puts to a person, raised from anywhere a run, a build or a
 * repair needs one.
 *
 * `parks` is the whole of the difference between a question and a dead end. A
 * parking ask stops the work where it stands and keeps everything it has done,
 * so an answer resumes it; one that does not park is said and the work carries
 * on. Nothing here opens a thread: the ask is what the runtime raises, and the
 * port that carries it is what puts it in front of a person.
 */
export type AutomationStudioAsk = AutomationStudioConversationAskInput & {
  status: AutomationStudioAskStatus;
  /** What the person is asked, in Core's own words. It becomes the words of the turn the ask hangs on. */
  text: string;
  raisedBy: {
    stage: AutomationStudioAskStage;
    nodeId?: string;
    definitionId?: string;
    attemptId?: string;
  };
};

/**
 * One option as whoever raises the ask writes it: an id, and the rest filled
 * in. The stored option names its label and its route outright, because a
 * thread read back a week later cannot infer either.
 */
export type AutomationStudioAskOptionDraft = { id: string; label?: string; route?: string | null };

/**
 * An ask as whoever raises it writes it: no status and no account of where it
 * came from, because the runtime knows both and the raiser does not. Keeping
 * them off the draft is what lets a node -- or a gate, or a domain adapter --
 * raise an ask in one object literal.
 *
 * `askId` is optional rather than absent, because something that already keys
 * its question under an id of its own keeps it. The action-permission request
 * is the case that matters: its `requestId` is "the key a store would hold it
 * under", which is an ask id by another name, and a gate must be able to raise
 * an ask under the id its payload already carries. Anything else leaves it out
 * and the runtime names the ask after the attempt that raised it.
 */
export type AutomationStudioAskDraft = Omit<AutomationStudioAsk, "askId" | "status" | "raisedBy" | "options"> & {
  askId?: string;
  options?: readonly AutomationStudioAskOptionDraft[] | null;
};
