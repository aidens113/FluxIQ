// The live activity that belongs in the chat on screen. No DOM.
//
// The events are the relay's `history` -- each recent unit of work's whole
// story -- or, from a background that keeps none, its `recent` window.
//
//   - Work that speaks through another thread (any of its events names a
//     different `conversationId`) belongs to that thread, and never shows in
//     this one, whichever chat this is -- except in the question chat opened
//     for that very work.
//   - The latest chat shows everything else, as FluxIQ's own chat does.
//   - An automation's chat shows only the work on that automation: events
//     whose subject names its Flow, or that speak through the thread on
//     screen.
//   - A question's chat (the thread a build or a run asked the person in)
//     shows the work that asked, and what speaks through the thread on screen.
//   - A thread chosen from the thread list (`kind: "thread"`) is told by its id
//     and shows what the project's chats show: the work that speaks through
//     another thread stays out, the rest is the project's, as in the old chat.
//
// The live line follows the paced display while the unit of work it
// describes is one this chat shows, and always while that work waits for the
// person: a question nobody sees is a build or a run stopped for good, so
// every chat says so. When the question is not in the thread on screen,
// `answerIn` names the thread that holds it (`askThread`), and the live line
// offers to open it.
//
// The starting status (`kind: "starting"`) is the person's own send, which
// the relay puts up the moment it leaves and Core's first activity replaces
// (`background/activity/send-start.ts`). No event of Core's carries it, so a
// rule that asks for one never shows it: a project's chat said "Sending your
// message" for the second and a half the overlay said "Starting…" (R2-U-5,
// `run-muwansvz-a2b4a987`, moment 02). It shows in every chat.

import type { ChatActivityState } from "../ports/index.ts";
import type { ActivityDisplay, ClientGatewayActivity } from "fluxiq/ui";
import { sameThread } from "../same-thread.ts";
import type { ChatTarget } from "../target.ts";
import { askThread, type QuestionTarget } from "./ask-thread.ts";

/** The events and the paced display the chat on screen shows, and where to answer what the work asks. */
export type TargetActivity = {
  /** The events the chat tells as step messages, oldest first. */
  events: ClientGatewayActivity[];
  display: ActivityDisplay | null;
  /** The thread holding the question the work waits on, when it is not the thread on screen; null otherwise. */
  answerIn: QuestionTarget | null;
};

/** `state`'s activity for `target`, whose thread on screen is `conversationId` when there is one. */
export function activityForTarget(state: ChatActivityState, target: ChatTarget, conversationId: string | undefined): TargetActivity {
  const display = state.display ?? null;
  // A chosen thread is known by its id before it has been read.
  if (target.kind === "thread") conversationId = target.conversationId;
  const wide = target.kind === "latest" || target.kind === "project" || target.kind === "thread";
  const own = target.kind === "question" ? target.activityId : undefined;
  const inScope = (event: ClientGatewayActivity): boolean => target.projectId === undefined || event.subject.projectId === target.projectId;
  const story = (state.history ?? state.recent).filter(inScope);
  const elsewhere = new Set(
    conversationId === undefined
      ? []
      : [...story, ...state.recent.filter(inScope)]
        .filter((event) => event.conversationId !== undefined && event.conversationId !== conversationId && event.activityId !== own)
        .map((event) => event.activityId)
  );
  const belongs = (event: ClientGatewayActivity): boolean => {
    if (!inScope(event)) return false;
    if (elsewhere.has(event.activityId)) return false;
    if (wide) return true;
    if (conversationId !== undefined && event.conversationId === conversationId) return true;
    return target.kind === "automation" ? event.subject.flowId === target.flowId : event.activityId === target.activityId;
  };
  const events = story.filter(belongs);
  const asked = askThread(state);
  const answerIn = asked !== undefined && (target.projectId === undefined || asked.projectId === target.projectId) && !asksHere(target, asked) ? asked : null;
  const carried = (): boolean => display !== null
    && (target.projectId === undefined || [...story, ...state.recent, ...(state.current ? [state.current] : [])].some(event => event.activityId === display.activityId && inScope(event)))
    && (display.outcome === "waiting" || (wide && elsewhere.size === 0) || [...events, ...state.recent].some((event) => event.activityId === display.activityId && belongs(event)));
  const shown = display !== null && (display.kind === "starting" || carried());
  return { events, display: shown ? display : null, answerIn };
}

/** True when `target`'s thread is the one `asked` names. */
function asksHere(target: ChatTarget, asked: QuestionTarget): boolean {
  if (target.kind === "automation") return asked.subjectKind === "flow" && asked.subjectId === target.flowId;
  return sameThread(target, target.projectId === undefined ? { ...asked, projectId: undefined } : asked);
}
