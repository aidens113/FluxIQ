import type { ClientGatewayActivityAgent } from "./agent.ts";
import type { ClientGatewayActivityPhase } from "./phase.ts";
import type { ClientGatewayActivityProjectCard } from "./project-card.ts";
import type { ClientGatewayActivityRecovery } from "./recovery/index.ts";
import type { ClientGatewayActivityResolution } from "./resolution.ts";
import type { ClientGatewayActivitySkip } from "./skip.ts";

/**
 * One activity event: the current status of one unit of work (a build or a
 * run) plus an optional detail row for the chat stream. Bounded, and
 * content-free beyond what the person's own panel already shows: labels and
 * titles are Core's own sentences, the actions a step's own input names, tool
 * and node ids, and authored step labels; never raw evidence a tool gathered,
 * tokens or secrets. A `thought` row's `text` is the model's own stated reason
 * for that step (what it does next, on what, and why) or its diagnosis or
 * verdict, whitespace-collapsed, with token-shaped runs hidden, and bounded
 * (240 characters for a decision's reason). Core truncates `label` to 160
 * characters, `detail.title` to 160, `detail.recovery.subject` and
 * `detail.skipped.subject` to 160 and
 * `detail.text` to 1,000.
 *
 * A wait on the person is one `ask` row pair for one card. The wait opens as
 * `phase: "waiting_permission"`, `detail: { kind: "ask", ref: <askId>,
 * status: "started" }`. When it is settled, Core sends one more `ask` row for
 * the same unit of work with the same `ref` and `title`, the phase the work
 * returns to, `status` `succeeded` (answered, allowed, waited out) or `failed`
 * (declined, timed out, cancelled), `resolution`, and `text`, a sentence such
 * as "You pressed Continue.". A client marks the card from that row alone and
 * never infers the answer from later events. Every wait Core announced gets
 * that row, including one whose work stopped first (`cancelled`); a wait Core
 * never announced is never resolved. A run parked durably is still waiting
 * until it is resumed.
 */
export type ClientGatewayActivity = {
  /** Stable id of the unit of work this event belongs to. */
  activityId: string;
  /** Strictly increasing per Core process, so a client can drop stale events. */
  sequence: number;
  subject: { kind: "build" | "run"; id: string; projectId: string; flowId?: string };
  phase: ClientGatewayActivityPhase;
  /** Core's one-line status sentence, e.g. "Running step 2 of 5". */
  label: string;
  step?: {
    index: number;
    count: number;
    nodeId?: string;
    label?: string;
    /**
     * On a step a list loop's pass runs: that pass's row as a person reads it
     * ("Jonas Weber"), so a card can say "Confirm · Jonas Weber". Optional; a
     * client that does not know it ignores it.
     */
    row?: string;
  };
  /** A row for the chat stream; absent for a pure status change. */
  detail?: {
    kind: "thought" | "tool" | "step" | "check" | "ask" | "note";
    title: string;
    text?: string;
    status?: "started" | "succeeded" | "failed";
    /** Tool or node id the row describes, when there is one; an `ask` row's ask id. */
    ref?: string;
    /**
     * On the `ask` row that settles a wait: how it ended. Optional, so a client
     * that does not know it reads the row by `status` alone.
     */
    resolution?: ClientGatewayActivityResolution;
    /**
     * On a `step` row only: the recovery the row reports (a handler that ran,
     * an alternative entry, a route, an alternative path, a layer the client
     * closed). Optional and
     * additive; a client that does not know it reads the row as a plain step.
     */
    recovery?: ClientGatewayActivityRecovery;
    /**
     * On a `step` row only: the step was skipped rather than run, and why.
     * Optional and additive; a client that does not know it reads the row as a
     * plain step that succeeded.
     */
    skipped?: ClientGatewayActivitySkip;
    /** On a `note` row only: a card of the supervisor's work (plan, brief, return, receipt). */
    project?: ClientGatewayActivityProjectCard;
  };
  /** Which of a build's agents the event comes from; absent on a build with one agent. */
  agent?: ClientGatewayActivityAgent;
  /** The conversation this work speaks through, when it has one. */
  conversationId?: string;
  /**
   * The person's own words for what this work was asked to do: a build's
   * instruction, on the event that says the build has it. A chat shows it as
   * the person's message where its thread does not already hold it, so what
   * was asked is on screen however the build was started. Absent on every
   * other event.
   */
  request?: string;
  /** True on the last event of the unit of work (`done` or `failed`). */
  final?: boolean;
  /**
   * True only on the final event of work a person or caller cancelled (Stop
   * on a run or a build), set from the cancellation itself and never from the
   * label. Absent on every other event, so a client says "stopped" rather than
   * "failed" by reading this field, not Core's words.
   */
  stopped?: true;
  /** ISO timestamp. */
  at: string;
};
