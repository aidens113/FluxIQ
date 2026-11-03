// A build with several agents in the chat (automation-project-agents-plan,
// chat presentation; unit W2). No DOM.
//
// Each card of the project supervisor's work -- its plan, a brief it
// dispatched, the builder's return, a validator's receipt -- is a message of
// its own, a `project` message: a heading and one card in words
// (`project-words.ts`), keyed by the note row that carried it like any step
// message. A brief's card works until the return for that brief arrives, and
// then shows how the builder came back. A brief dispatched while another is
// still out waits (`brief-wait.ts`) until its own builder's first event, and
// one that comes back still waiting says it was never started (t649).
//
// Every other message keeps its author (`agent`). A builder's steps follow
// the brief that dispatched them, so the brief is their subflow header; a
// message whose agent's lane is not the lane of the message before it in its
// unit of work names its lane (`lane`: "Builder · Search", "Validator",
// "Supervisor"), so steps that come back to a lane, or interleave with
// another, still say whose they are. Right after a brief its builder's first
// step names no lane: the brief just did.

import { activityAgent, projectCard, type ActivityAgent, type ActivityProjectCard, type ClientGatewayActivity } from "fluxiq/ui";
import type { StepMessage } from "./messages.ts";
import { waitingBriefWords } from "./brief-wait.ts";
import { laneWords, projectWords, type ProjectNames, type ProjectWords } from "./project-words.ts";

type Brief = Extract<ActivityProjectCard, { kind: "brief" }>;

/** Builds the build's project messages, remembering what each card named for the cards after it. */
export type ProjectMessages = {
  /** The message for `card`, carried by `event`'s note row, opened at `at`. */
  message(event: ClientGatewayActivity, card: ActivityProjectCard, at: number): StepMessage;
  /** Takes any event of the stream, in order: the first one from a waiting brief's builder starts that brief's card. */
  seen(event: ClientGatewayActivity): void;
};

/** A fresh book of one stream's project cards. */
export function projectMessages(): ProjectMessages {
  const briefs = new Map<string, Pick<Brief, "brief" | "subflowName">>();
  const subflows = new Map<string, string>();
  const names: ProjectNames = { briefs, subflows };
  /** Each brief's message by the brief's id, so its return marks its card. */
  const dispatched = new Map<string, StepMessage>();
  /** The briefs dispatched and not yet returned, by id: each one's part's name. */
  const open = new Map<string, string>();
  /** The briefs whose builder has not started, by id: what each one's card says once it does. */
  const waiting = new Map<string, ProjectWords>();

  return {
    message(event, card, at) {
      const words = projectWords(card, names, activityAgent(event));
      const message: StepMessage = {
        key: `step:${event.activityId}#${event.sequence}`,
        activityId: event.activityId,
        kind: "project",
        title: words.title,
        text: words.text,
        actions: [],
        at,
        sequence: event.sequence,
        latest: false,
        project: words
      };
      if (card.kind === "plan") for (const subflow of card.subflows) subflows.set(subflow.key, subflow.name);
      if (card.kind === "brief") {
        briefs.set(card.briefId, { brief: card.brief, subflowName: card.subflowName });
        dispatched.set(card.briefId, message);
        // Dispatched while a part it starts after is still out, it waits until its own builder starts (`brief-wait.ts`).
        const out = [...open.entries()].filter(([id]) => id !== card.briefId).map(([, name]) => name);
        open.set(card.briefId, card.subflowName);
        const waitsFor = card.after === undefined ? undefined : [...new Set(out.filter((name) => card.after!.includes(name)))];
        if (waitsFor === undefined ? out.length > 0 : waitsFor.length > 0) {
          waiting.set(card.briefId, words);
          // Core names the parts it starts after; an older Core does not, and only one brief out can be named then.
          const held = waitingBriefWords(words, card, waitsFor ?? (out.length === 1 ? out : undefined));
          message.title = held.title;
          message.project = held;
        }
      }
      if (card.kind === "return") {
        const brief = dispatched.get(card.briefId);
        // A brief that came back while it still waited never started: its card says so, as its return does.
        const neverStarted = waiting.delete(card.briefId);
        open.delete(card.briefId);
        if (brief?.project !== undefined) {
          brief.project = { ...brief.project, card: { ...brief.project.card, state: words.card.state, ...(neverStarted ? { outcome: words.card.outcome } : {}) } };
          brief.sequence = Math.max(brief.sequence, event.sequence);
        }
      }
      return message;
    },
    seen(event) {
      const agent = activityAgent(event);
      if (agent?.briefId === undefined || agent.role === "supervisor") return;
      const running = waiting.get(agent.briefId);
      const brief = dispatched.get(agent.briefId);
      if (running === undefined || brief === undefined) return;
      waiting.delete(agent.briefId);
      brief.title = running.title;
      brief.project = running;
      brief.sequence = Math.max(brief.sequence, event.sequence);
    }
  };
}

/**
 * `messages` with each one's author (`agent`) and, where its lane is not the
 * lane of the message before it in its unit of work, the lane's name
 * (`lane`). `events` are the events the messages were made from: each
 * message's key names the one that opened it.
 */
export function withAgents(messages: readonly StepMessage[], events: readonly ClientGatewayActivity[]): StepMessage[] {
  const opened = new Map<string, ClientGatewayActivity>();
  for (const event of events) opened.set(`step:${event.activityId}#${event.sequence}`, event);
  const last = new Map<string, string>();
  return messages.map((message) => {
    const event = opened.get(message.key);
    const agent = event === undefined ? undefined : activityAgent(event);
    const card = message.kind === "project" && event !== undefined ? projectCard(event) : undefined;
    // A brief is its builder's subflow header: the steps after it are in the builder's lane already.
    const lane = card?.kind === "brief" ? `${card.brief === "repair" ? "repair" : "builder"}:${card.briefId}` : laneOf(agent);
    const before = last.get(message.activityId);
    last.set(message.activityId, lane);
    if (agent === undefined) return message;
    const named = lane !== before && message.kind !== "project" ? laneWords(agent) : undefined;
    return { ...message, agent, ...(named === undefined ? {} : { lane: named }) };
  });
}

/** The lane an agent's steps run in: its role, and the brief it works on when it has one. */
function laneOf(agent: ActivityAgent | undefined): string {
  return agent === undefined ? "" : `${agent.role}:${agent.briefId ?? ""}`;
}
