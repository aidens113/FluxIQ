import { describe, expect, it } from "vitest";
import { secretsLockedMessage } from "../../platform/model-keys/index.ts";
import { MODEL_KEY_LOCK_REASONS, modelKeyLockedWords, readModelKeyLockReason } from "../model-key-lock.ts";

describe("what a person reads about a locked key", () => {
  it("names one action, in FluxIQ, for every reason", () => {
    for (const reason of MODEL_KEY_LOCK_REASONS) expect(modelKeyLockedWords(reason)).toMatch(/Open FluxIQ/u);
  });

  it("never offers signing in or out as the fix", () => {
    for (const reason of MODEL_KEY_LOCK_REASONS) expect(modelKeyLockedWords(reason)).not.toMatch(/sign (in|out) (again|and)|sign in/iu);
    expect(secretsLockedMessage("app.example.test")).not.toMatch(/sign (in|out)/iu);
  });

  it("says why, in plain words, when something happened", () => {
    expect(modelKeyLockedWords("signed_out")).toContain("because you signed out of FluxIQ");
    expect(modelKeyLockedWords("administrator")).toContain("because an administrator ended your session");
    expect(modelKeyLockedWords("sessions_ended")).toContain("because all your FluxIQ sessions were ended");
    expect(modelKeyLockedWords("password_changed")).toContain("because your FluxIQ password changed");
  });

  it("does not ask for a password that cannot help after a reset", () => {
    expect(modelKeyLockedWords("password_reset")).toContain("add it again");
    expect(modelKeyLockedWords("password_reset")).not.toContain("password once");
  });

  it("says the first start as a setup to do, not as something gone wrong", () => {
    expect(modelKeyLockedWords("first_unlock")).toContain("to set that up");
    expect(modelKeyLockedWords("first_unlock")).not.toMatch(/fail|error|locked because/iu);
  });

  it("reads a reason it does not know as a lock with nothing more to say", () => {
    expect(readModelKeyLockReason("signed_out")).toBe("signed_out");
    expect(readModelKeyLockReason("some_future_reason")).toBe("unknown");
    expect(readModelKeyLockReason(undefined)).toBe("unknown");
  });
});
