// Core's question in the Studio's words, as the chat's ask port reads it: what
// each kind of ask offers, which answers ask for the PIN first, and what an
// answer carries.

import { describe, expect, it } from "vitest";
import { presentAsk } from "../present-ask";

const permissionAsk = {
  askId: "ask.1",
  kind: "permission",
  status: "pending",
  parks: true,
  missing: ["send_or_publish", "create_new"],
  control: { name: "Add to queue", kind: "button" }
};

describe("a question in the panel's words", () => {
  it("offers to grant exactly the classes the ask listed, only after the PIN, and to refuse without one", () => {
    const presented = presentAsk(permissionAsk)!;
    expect(presented.title).toBe("FluxIQ is asking for permission.");
    expect(presented.consequences).toEqual([
      "send or publish something that others will receive or see",
      "create something new that stays"
    ]);
    expect(presented.note).toBe('The control is "Add to queue" (button).');
    const [deny, allow] = presented.actions;
    expect(deny).toMatchObject({ id: "deny", label: "Don't allow", tone: "secondary", kind: "deny" });
    expect(deny).not.toHaveProperty("reauthorize");
    expect(allow).toMatchObject({ id: "grant", label: "Allow", tone: "primary", kind: "grant", reauthorize: { title: "Allow this action", actionLabel: "Allow" } });
    expect(allow!.reauthorize!.description).toContain("This answer has a lasting effect.");
    expect(presented.takesText).toBe(false);
  });

  it("offers one action per option, and asks for the PIN only on a destructive one", () => {
    const presented = presentAsk({
      askId: "ask.2",
      kind: "choice",
      status: "pending",
      parks: true,
      options: [
        { optionId: "opt.keep", label: "Keep the draft", description: "Nothing changes." },
        { optionId: "opt.delete", label: "Delete the draft", destructive: true }
      ]
    })!;
    expect(presented.actions[0]).toMatchObject({ id: "opt.keep", label: "Keep the draft", description: "Nothing changes.", kind: "choice", value: "opt.keep", tone: "secondary" });
    expect(presented.actions[0]).not.toHaveProperty("reauthorize");
    expect(presented.actions[1]).toMatchObject({ id: "opt.delete", tone: "danger", kind: "choice", value: "opt.delete", reauthorize: { title: "Confirm this answer" } });
  });

  it("confirms without inventing a consequence the ask did not carry", () => {
    const presented = presentAsk({ askId: "ask.3", kind: "confirm", status: "pending", parks: false })!;
    expect(presented.consequences).toEqual([]);
    expect(presented.actions.map((action) => action.label)).toEqual(["Cancel", "Confirm"]);
    expect(presented.actions[1]).toMatchObject({ kind: "grant", tone: "primary" });
    expect(presented.actions[1]).not.toHaveProperty("reauthorize");
  });

  it("asks for the PIN to confirm what has a consequence, as a danger", () => {
    const presented = presentAsk({ askId: "ask.5", kind: "confirm", status: "pending", parks: false, consequences: ["delete"] })!;
    expect(presented.actions[1]).toMatchObject({ label: "Confirm", tone: "danger", reauthorize: { title: "Confirm this answer", actionLabel: "Confirm" } });
  });

  it("takes words for an open ask, up to the conversation's length limit", () => {
    const presented = presentAsk({ askId: "ask.4", kind: "open", status: "pending", parks: true })!;
    expect(presented).toMatchObject({ takesText: true, actions: [], textMax: 8000, textHint: "Answer in your own words. FluxIQ reads this on its next turn." });
  });

  it("leaves a record it cannot read to the chat's own words", () => {
    expect(presentAsk(null)).toBeNull();
    expect(presentAsk({ askId: "ask.9", kind: "nonsense", status: "pending", parks: true })).toBeNull();
    expect(presentAsk({ ...permissionAsk, missing: ["something_unknown"] })).toBeNull();
  });
});
