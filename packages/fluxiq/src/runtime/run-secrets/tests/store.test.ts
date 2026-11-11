// A run's secrets are its own (W3, t899): concurrent runs in one process never see each other's, a run
// inside another keeps the outer run's too (so a child withholds its parent's), and nothing is set
// outside every run.
import { describe, expect, it } from "vitest";
import { automationStudioRunSecrets, runWithAutomationStudioRunSecrets } from "../index.ts";

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 1));

describe("run secrets", () => {
  it("are nothing outside every run", () => {
    expect(automationStudioRunSecrets()).toBeUndefined();
  });

  it("stay with their own run while two runs interleave", async () => {
    const seen: Array<[string, Readonly<Record<string, string>> | undefined]> = [];
    const run = (label: string, password: string) => runWithAutomationStudioRunSecrets({ password }, async () => {
      for (let step = 0; step < 3; step += 1) {
        await tick();
        seen.push([label, automationStudioRunSecrets()]);
      }
    });
    await Promise.all([run("a", "alpha-secret"), run("b", "bravo-secret")]);
    expect(seen.filter(([label]) => label === "a").every(([, secrets]) => secrets?.["password"] === "alpha-secret")).toBe(true);
    expect(seen.filter(([label]) => label === "b").every(([, secrets]) => secrets?.["password"] === "bravo-secret")).toBe(true);
    expect(automationStudioRunSecrets()).toBeUndefined();
  });

  it("keep the outer run's inside an inner one, with the inner name winning, and drop empty texts", () => {
    const inner = runWithAutomationStudioRunSecrets({ token: "outer-token", password: "outer-pass" }, () =>
      runWithAutomationStudioRunSecrets({ password: "inner-pass", empty: "" }, () => automationStudioRunSecrets()));
    expect(inner).toEqual({ token: "outer-token", password: "inner-pass" });
  });
});
