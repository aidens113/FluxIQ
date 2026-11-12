// The locked sentence a person is told when the workspace's key, not their own, is locked.
import { describe, expect, it } from "vitest";
import { isSecretsLockedError, secretsLockedMessage, workspaceKeyLockedMessage } from "../index.ts";

describe("the workspace's key is locked", () => {
  it("names the workspace's key and its owner, never the person's own key", () => {
    const message = workspaceKeyLockedMessage("app.getfluxiq.com");
    expect(message).toBe("This workspace's model key is locked: its owner must unlock it by opening app.getfluxiq.com and entering their password once");
    expect(message).not.toMatch(/your (model )?key/iu);
    expect(message).not.toMatch(/sign (in|out)/iu);
  });

  it("differs from the holder's own sentence, which keeps its words", () => {
    expect(workspaceKeyLockedMessage("127.0.0.1:3000")).not.toBe(secretsLockedMessage("127.0.0.1:3000"));
    expect(secretsLockedMessage("127.0.0.1:3000")).toBe("Unlock your model key: open 127.0.0.1:3000 and enter your password once");
  });

  it("travels as the same typed secrets.locked error", () => {
    expect(isSecretsLockedError({ code: "secrets.locked", message: workspaceKeyLockedMessage("app.getfluxiq.com") })).toBe(true);
  });
});
