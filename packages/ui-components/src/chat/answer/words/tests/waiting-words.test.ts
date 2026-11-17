import { expect, it } from "vitest";
import { waitingWords } from "../waiting-words.ts";

it("reads historical model-key waits without restoring a password action", () => {
  const words = waitingWords("model_key_locked", false);
  expect(words.headline).toBe("Model access was unavailable");
  expect(words.lead).toContain("current model configuration");
  expect(JSON.stringify(words)).not.toMatch(/unlock|password|PIN|sign in/iu);
});
