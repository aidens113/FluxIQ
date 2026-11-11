// Holds on panel threads (`../thread-use.ts`): a removal is refused while work
// holds the thread, a hold is refused while the thread is being removed, and a
// thread is let go only when every hold on it is released.

import { describe, expect, it } from "vitest";
import { PanelAssistantThreadUse } from "../thread-use.ts";

describe("PanelAssistantThreadUse", () => {
  it("refuses a removal while work holds the thread, and allows it once every hold is released", async () => {
    const use = new PanelAssistantThreadUse();
    const first = use.hold("ada\u0000conversation.1");
    const second = use.hold("ada\u0000conversation.1");
    let removed = 0;
    const remove = async () => {
      removed += 1;
      return "removed";
    };
    await expect(use.remove("ada\u0000conversation.1", remove)).rejects.toMatchObject({ code: "conversation_run_active" });
    first();
    first();
    await expect(use.remove("ada\u0000conversation.1", remove)).rejects.toMatchObject({ code: "conversation_run_active" });
    second();
    await expect(use.remove("ada\u0000conversation.1", remove)).resolves.toBe("removed");
    expect(removed).toBe(1);
    // Another person's thread under the same id is not held by this work.
    use.hold("ada\u0000conversation.2");
    await expect(use.remove("grace\u0000conversation.2", remove)).resolves.toBe("removed");
  });

  it("refuses new work on a thread while it is being removed, as a thread that does not exist", async () => {
    const use = new PanelAssistantThreadUse();
    let finish: () => void = () => undefined;
    const removing = use.remove("ada\u0000conversation.1", () => new Promise<void>((resolve) => {
      finish = resolve;
    }));
    expect(() => use.hold("ada\u0000conversation.1")).toThrow(expect.objectContaining({ code: "conversation_not_found", message: "I could not find that conversation." }));
    finish();
    await removing;
    expect(() => use.hold("ada\u0000conversation.1")).not.toThrow();
  });

  it("lets the thread go when a removal fails", async () => {
    const use = new PanelAssistantThreadUse();
    await expect(use.remove("ada\u0000conversation.1", async () => {
      throw new Error("disk full");
    })).rejects.toThrow("disk full");
    expect(() => use.hold("ada\u0000conversation.1")).not.toThrow();
  });
});
