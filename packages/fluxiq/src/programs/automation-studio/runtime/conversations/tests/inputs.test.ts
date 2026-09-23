// What the store refuses before it writes anything.
//
// These are the checks a database test cannot show cheaply: they run before any
// SQL, so they are read here directly. The consequence check in particular has
// to live at the write -- the runtime that raises an ask reaches the browser
// bundle through the approval node and so cannot import the vocabulary's value
// -- which makes this the only place an invented consequence class is caught.

import { describe, expect, it } from "vitest";

import { automationStudioConversationAskOrRefuse } from "../inputs.ts";
import type { AutomationStudioConversationAskInput } from "../ask.ts";

function permissionAsk(overrides: Partial<AutomationStudioConversationAskInput> = {}): AutomationStudioConversationAskInput {
  return { askId: "approve.attempt.1", kind: "permission", parks: true, ...overrides };
}

describe("the ask a write has to satisfy", () => {
  it("takes the five consequence classes Core names, on both consequences and missing", () => {
    expect(automationStudioConversationAskOrRefuse(permissionAsk({ consequences: ["send_or_publish", "create_new"], missing: ["send_or_publish"] }))).toMatchObject({
      missing: ["send_or_publish"]
    });
  });

  it("refuses a class Core does not name, rather than storing it as though it did", () => {
    // An ask that reached the thread carrying an invented class would be read
    // back by everything that decides whether an answer may be given in
    // passing, and would be neither refused nor recognised there.
    expect(() => automationStudioConversationAskOrRefuse(permissionAsk({ missing: ["external_side_effect" as never] }))).toThrow("A consequence class is one of");
    expect(() => automationStudioConversationAskOrRefuse(permissionAsk({ consequences: ["deletes_things" as never] }))).toThrow("A consequence class is one of");
  });

  it("still refuses the things it refused before: a choice with one option, and a permission ask keyed by anything but its request", () => {
    expect(() => automationStudioConversationAskOrRefuse(permissionAsk({ kind: "choice", options: [{ id: "only", label: "Only", route: null }] }))).toThrow("at least two options");
    expect(() => automationStudioConversationAskOrRefuse(permissionAsk({ permissionRequest: { requestId: "another" } as never }))).toThrow("requestId");
  });
});
