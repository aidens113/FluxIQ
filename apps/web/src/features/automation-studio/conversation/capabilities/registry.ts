// The registry: one declaration of a panel capability, read by both callers.
//
// A control looks a capability up by id and calls `invoke`. The conversation
// resolves a person's words to the same capability and calls the same
// `invoke`. Neither owns the declaration, so neither can drift from the other.
//
// **Duplicate ids are a build failure, not a last-one-wins.** Two capabilities
// answering to `flow.run` would silently give the conversation one of them and
// the panel the other, which is the exact class of bug this registry exists to
// remove, so the map is built once and refuses.

import { PANEL_CAPABILITIES } from "./catalog";
import type { PanelCapability, PanelCapabilityGroup } from "./contract";

let registry: ReadonlyMap<string, PanelCapability> | null = null;

function panelCapabilityRegistry(): ReadonlyMap<string, PanelCapability> {
  if (registry) return registry;
  const built = new Map<string, PanelCapability>();
  for (const capability of PANEL_CAPABILITIES) {
    if (built.has(capability.id)) throw new Error(`Two panel capabilities answer to "${capability.id}".`);
    built.set(capability.id, capability);
  }
  registry = built;
  return registry;
}

/** Every capability, in the order the catalog declares them. */
export function panelCapabilities(): readonly PanelCapability[] {
  return PANEL_CAPABILITIES;
}

export function panelCapability(id: string): PanelCapability | null {
  return panelCapabilityRegistry().get(id) ?? null;
}

export function panelCapabilityIds(): string[] {
  return [...panelCapabilityRegistry().keys()];
}

/** Every Core endpoint the registry can reach, which is what coverage is measured against. */
export function panelCapabilityEndpoints(): Set<string> {
  return new Set(PANEL_CAPABILITIES.flatMap((capability) => capability.endpoints));
}

/** The capabilities under one heading, for an answer a person reads rather than parses. */
export function panelCapabilitiesByGroup(): Map<PanelCapabilityGroup, PanelCapability[]> {
  const grouped = new Map<PanelCapabilityGroup, PanelCapability[]>();
  for (const capability of PANEL_CAPABILITIES) {
    const existing = grouped.get(capability.group);
    if (existing) existing.push(capability);
    else grouped.set(capability.group, [capability]);
  }
  return grouped;
}

/**
 * The endpoints the panel writes through that deliberately have no
 * conversational path, each with the reason.
 *
 * `tests/coverage.test.ts` reads this list. An endpoint the panel posts that is
 * neither in the catalog nor named here fails the build, which is the
 * mechanical form of "a capability cannot be added with a button but no
 * conversational path". Adding an entry here is a decision someone has to write
 * a sentence for, not a way of making the test quiet.
 */
export const PANEL_ENDPOINTS_WITHOUT_A_CAPABILITY: Readonly<Record<string, string>> = Object.freeze({
  "save-flow": "The editor's whole-document save, which sends the graph as the canvas holds it. The conversation changes a Flow by saying what it should do (`flow.describe`) and having it built.",
  "apply-graph-patch": "A live drag of a node on a canvas, carrying viewport geometry a sentence cannot express.",
  "save-project-ui-cache": "Where the panes were left on screen. Nobody asks for that in words.",
  "delete-project-ui-cache": "Where the panes were left on screen, cleared when the workspace is reset.",
  "append-turn": "Writing in the conversation is the conversation itself, not one of the things it drives.",
  "answer-ask": "Answering a question FluxIQ asked is already the conversation's own control, on the turn that asked it.",
  "execute-client-action": "One browser action inside a live recording session, driven from the recorder at recorder speed.",
  "start-client-recording": "Begins a browser recording, which needs the browser in front of the person.",
  "stop-client-recording": "Ends a browser recording begun at the browser.",
  "capture-client-snapshot": "Takes a snapshot of whatever page the recorder is looking at, so it needs that browser to be open and on it.",
  "create-recording": "Opens a recording around a live browser session; the browser has to be there.",
  "finalize-recording": "Closes a recording the browser is still writing into.",
  "repair-recording-state-index": "A maintenance repair of a recording's index, reached from the recording it repairs.",
  "delete-project-artifact": "Removes a stored object the pipeline produced. It goes with the recording that produced it, through `recording.delete`.",
  "create-recording-flow-proposals": "The first half of `generateRecordingDeterministicSubflow`, a recording-side workflow rather than something asked for on its own.",
  "review-recording-flow-proposal": "The second half of that same recording-side workflow.",
  "put-project-hierarchy-node": "The project tree's own persistence. It writes a node record the widget built, batched under a replay id, rather than anything a sentence describes.",
  "delete-project-hierarchy-node": "The same tree persistence, removing a node the widget is holding.",
  "reorder-project-categories": "Dragging the project list into an order. There is nothing to say about it in words.",
  "create-project-category": "A folder the project list is grouped by, made and named where the list is, beside the projects going into it.",
  "update-project-category": "Renames one of those folders, which is done in place in the list rather than described.",
  "delete-project-category": "Removes one of those folders. It holds nothing of its own, so removing it is a tidy-up of the list rather than a deletion a person asks for.",
  "mutate-flow-map-route": "A fine-grained edit the router editor makes while a route is open; `route.save` is the conversational form.",
  "delete-flow-map-route-group": "Removes a group the router canvas built; a branch goes through `route.delete`.",
  "save-flow-map-route-group": "Groups routes into a box on the router canvas, which is a drawing decision rather than a change to what the Flow does."
});
