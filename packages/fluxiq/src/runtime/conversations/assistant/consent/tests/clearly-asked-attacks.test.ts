// Adversarial review P9-R2 of the words-clearly-ask matcher: words that name a
// consequential act and its target without asking for it. Each case here was a
// "yes" before the review and must be a "no"; the last block pins the requests
// that must still run at once.

import { describe, expect, it } from "vitest";
import type { PanelAssistantContext, PanelAssistantTarget } from "../../types.ts";
import type { PanelAssistantGatedClass } from "../gated-class.ts";
import { panelAssistantClearlyAsked } from "../clearly-asked.ts";

const flow = (id: string, name?: string) => ({ kind: "Flow", id, contextKey: "flowId" as const, ...(name === undefined ? {} : { name }) });
const OLD_SEARCH: PanelAssistantTarget = { items: [flow("flow.old", "Old search")] };
const NEW_SEARCH: PanelAssistantTarget = { items: [flow("flow.new", "New search")] };

const asks = (words: string, target: PanelAssistantTarget = OLD_SEARCH, context: PanelAssistantContext = {}, classes: readonly PanelAssistantGatedClass[] = ["delete"]) =>
  panelAssistantClearlyAsked({ words, classes, target, context });

describe("panelAssistantClearlyAsked under attack", () => {
  it("reads a negation however it is punctuated", () => {
    expect(asks("delete Old search... or not.")).toBe(false);
    expect(asks("Delete Old search? Don't!")).toBe(false);
    expect(asks("delete Old search -- no.")).toBe(false);
  });

  it("does not read a question as a request when it has no question mark", () => {
    expect(asks("should I delete Old search")).toBe(false);
    expect(asks("how do I delete Old search")).toBe(false);
    expect(asks("what happens if I delete Old search")).toBe(false);
    expect(asks("can I delete Old search")).toBe(false);
    expect(asks("Can you tell me how to delete Old search?")).toBe(false);
  });

  it("does not read a verb inside quotation marks as the person's own request", () => {
    expect(asks("The note says “delete Old search”, what does it mean")).toBe(false);
    expect(asks("“remove Old search” was in the last run's output")).toBe(false);
  });

  it("does not read a verb inside the target's own name as asking", () => {
    const named: PanelAssistantTarget = { items: [flow("flow.rows", "Delete old rows")] };
    expect(asks("open Delete old rows", named)).toBe(false);
    expect(asks("Delete old rows looks wrong, show me its steps", named)).toBe(false);
    expect(asks("delete Delete old rows", named)).toBe(true);
  });

  it("does not read a verb said about other words, or about another item, as asking for this one", () => {
    expect(asks("explain why deleting Old search failed")).toBe(false);
    expect(asks("rename Old search and delete the copy")).toBe(false);
    expect(asks("delete Old search and rename New search", NEW_SEARCH)).toBe(false);
    expect(asks("delete Old search, then show me New search", NEW_SEARCH)).toBe(false);
    expect(asks("delete Old search and send New search", NEW_SEARCH)).toBe(false);
  });

  it("does not read removing an item from somewhere as deleting it", () => {
    expect(asks("remove Old search from my favourites")).toBe(false);
    expect(asks("take Old search out of the folder and delete this", OLD_SEARCH, { flowId: "flow.old" })).toBe(true);
    expect(asks("remove this from the list", OLD_SEARCH, { flowId: "flow.old" })).toBe(false);
  });

  it("reads a bare this as the innermost thing selected, never the project around it", () => {
    const project: PanelAssistantTarget = { items: [{ kind: "project", id: "p.1", contextKey: "projectId" }] };
    const onFlow = { projectId: "p.1", flowId: "flow.old" };
    expect(asks("delete this", project, onFlow)).toBe(false);
    expect(asks("delete this project", project, onFlow)).toBe(true);
    expect(asks("delete this", OLD_SEARCH, onFlow)).toBe(true);
    expect(asks("delete this flow", project, onFlow)).toBe(false);
    expect(asks("delete these recordings", project, { projectId: "p.1" })).toBe(false);
  });

  it("does not take a this inside a name, or a this another verb governs, as pointing", () => {
    const thisWeek: PanelAssistantTarget = { items: [flow("flow.week", "This week")] };
    expect(asks("rename this and delete Old search", NEW_SEARCH, { flowId: "flow.new" })).toBe(false);
    expect(asks("open This week and delete it", thisWeek, { flowId: "flow.week" })).toBe(false);
  });

  it("does not let one name single out two items that share it", () => {
    const twins: PanelAssistantTarget = { items: [flow("flow.a", "Old search"), flow("flow.b", "Old search")] };
    expect(asks("delete Old search", twins)).toBe(false);
  });

  it("does not read a choice or a condition as asking", () => {
    const both: PanelAssistantTarget = { items: [flow("flow.old", "Old search"), flow("flow.new", "New search")] };
    expect(asks("delete Old search or New search", NEW_SEARCH)).toBe(false);
    expect(asks("delete Old search if it has no runs")).toBe(false);
    expect(asks("delete whichever of Old search and New search is older", both)).toBe(false);
    expect(asks("maybe delete Old search")).toBe(false);
  });

  it("does not read a word that also means something harmless as a class verb", () => {
    const key: PanelAssistantTarget = { items: [{ kind: "key", id: "key.1", contextKey: "keyId" }] };
    expect(asks("order Old search and New search by date", OLD_SEARCH, {}, ["money"])).toBe(false);
    expect(asks("access this key", key, { keyId: "key.1" }, ["security"])).toBe(false);
  });

  it("never reads a call that names more than its target as asked", () => {
    expect(asks("delete Old search", { items: OLD_SEARCH.items, partial: true })).toBe(false);
  });

  it("still runs what the words do clearly ask", () => {
    const both: PanelAssistantTarget = { items: [flow("flow.old", "Old search"), flow("flow.new", "New search")] };
    expect(asks("delete Old search")).toBe(true);
    expect(asks("ok, go ahead and delete the Flow called Old search.")).toBe(true);
    expect(asks("I want you to remove Old search")).toBe(true);
    expect(asks("delete the flows Old search & New search", both)).toBe(true);
    expect(asks("Rename New search, then delete Old search")).toBe(true);
    expect(asks("delete the selected flow", OLD_SEARCH, { projectId: "p.1", flowId: "flow.old" })).toBe(true);
    expect(asks("Could you erase “Old search” please?")).toBe(true);
  });
});
