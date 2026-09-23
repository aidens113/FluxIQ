import type { JsonValue } from "../../../../core/index.ts";

/** What an ask wants back from the person. */
export type AutomationStudioAskKind = "permission" | "choice" | "confirm" | "open";

/** Where in the product's work the ask was raised, so a surface can say what is waiting. */
export type AutomationStudioAskStage = "execution" | "authoring" | "recovery";

/** One answer a `choice` ask offers, and the route taking it resumes the run down. */
export type AutomationStudioAskOption = {
  value: string;
  label: string;
  /** The route this option resumes down. Absent takes the ask's `answered` route. */
  route?: string;
};

/**
 * Where each way of settling an ask resumes the run.
 *
 * Resolved when the ask is raised rather than when it is answered, so one
 * record says what every outcome leads to and nothing has to re-read the node's
 * parameters days later. `expired` already accounts for `onTimeout: "deny"`.
 */
export type AutomationStudioAskRoutes = {
  /** A grant, a free-text answer, or a chosen option with no route of its own. */
  answered: string;
  /** A refusal. */
  denied: string;
  /** Nobody answering in time. */
  expired: string;
};

/**
 * A question Core puts to a person, raised from anywhere a run, a build or a
 * repair needs one.
 *
 * `parks` is the whole of the difference between a question and a dead end. A
 * parking ask stops the work where it stands and keeps everything it has done,
 * so an answer resumes it; one that does not park is said and the work carries
 * on. Nothing here knows about conversations: the ask is what the runtime
 * raises, and the port that carries it decides where a person sees it.
 */
export type AutomationStudioAsk = {
  askId: string;
  kind: AutomationStudioAskKind;
  /** Whether the work waits for the answer instead of going on without it. */
  parks: boolean;
  status: "pending" | "answered" | "expired";
  /** What the person is asked, in Core's own words. */
  text: string;
  options?: readonly AutomationStudioAskOption[];
  /** How long an answer is waited for. `0` or absent waits indefinitely. */
  timeoutMs?: number;
  onTimeout?: "deny" | "default";
  routes?: AutomationStudioAskRoutes;
  /** For a permission ask: the consequence classes the work does not yet hold. */
  missing?: readonly string[];
  /** The thing the answer is about, when the ask names one. */
  control?: { name?: string; kind?: string };
  raisedBy: {
    stage: AutomationStudioAskStage;
    nodeId?: string;
    definitionId?: string;
    attemptId?: string;
  };
  metadata?: Record<string, JsonValue>;
};

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
export type AutomationStudioAskDraft = Omit<AutomationStudioAsk, "askId" | "status" | "raisedBy"> & { askId?: string };
