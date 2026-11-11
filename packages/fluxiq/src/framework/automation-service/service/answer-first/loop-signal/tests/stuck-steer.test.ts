// What the round after a stopped loop is told (`../stuck-steer.ts`, R7 revision): take a different
// way and keep going, and never wait for the person.
import { describe, expect, it } from "vitest";
import { automationStudioAnswerFirstStuckSteer } from "../index.ts";

describe("the steer after a stopped loop", () => {
  it("says the loop was stopped, points at what was tried, and asks for a different way until the result", () => {
    const steer = automationStudioAnswerFirstStuckSteer(false);
    expect(steer.words).toMatch(/kept repeating itself .* so it was stopped/u);
    expect(steer.words).toMatch(/Everything under tried was already done/u);
    expect(steer.words).toMatch(/Take a different way to the result/u);
    expect(steer.words).toMatch(/Keep going until you have the result/u);
    expect(steer.personAsked).toBeUndefined();
  });

  it("says the person was asked, and never to wait for them", () => {
    const steer = automationStudioAnswerFirstStuckSteer(true);
    expect(steer.personAsked).toMatch(/Do not wait for them: carry on now/u);
    expect(steer.personAsked).toMatch(/personSaid/u);
  });

  it("names no site, no task and no tool", () => {
    for (const asked of [true, false]) expect(JSON.stringify(automationStudioAnswerFirstStuckSteer(asked))).not.toMatch(/library|loan|renew|calendar|slot|core\.|run_node/iu);
  });
});
