import { describe, expect, it } from "vitest";
import { automationStudioDomainReadings, runWithAutomationStudioDomainReadings, type AutomationStudioDomainReadings } from "../index.ts";

const of = (word: string): Readonly<AutomationStudioDomainReadings> => ({ activityControlReader: () => ({ names: [word], kinds: [] }) });
const said = (): unknown => automationStudioDomainReadings()?.activityControlReader?.(undefined)?.names[0];
const tick = () => new Promise((resolve) => setTimeout(resolve, 1));

describe("a unit of work's domain readings", () => {
  it("are none outside any unit of work", () => {
    expect(automationStudioDomainReadings()).toBeUndefined();
  });

  it("stay with the work they were entered for, across its awaits, however it interleaves with another's", async () => {
    const work = async (rounds: number): Promise<unknown[]> => {
      const seen: unknown[] = [];
      for (let round = 0; round < rounds; round += 1) {
        seen.push(said());
        await tick();
      }
      return seen;
    };
    const [one, two, none] = await Promise.all([runWithAutomationStudioDomainReadings(of("one"), () => work(4)), runWithAutomationStudioDomainReadings(of("two"), () => work(4)), work(2)]);
    expect(one).toEqual(["one", "one", "one", "one"]);
    expect(two).toEqual(["two", "two", "two", "two"]);
    expect(none).toEqual([undefined, undefined]);
  });

  it("never fall back to what the work was started under: a domain with none reads none", async () => {
    await runWithAutomationStudioDomainReadings(of("outer"), async () => {
      expect(said()).toBe("outer");
      expect(await runWithAutomationStudioDomainReadings({}, async () => {
        await tick();
        return said();
      })).toBeUndefined();
      expect(await runWithAutomationStudioDomainReadings(of("inner"), async () => {
        await tick();
        return said();
      })).toBe("inner");
      expect(said()).toBe("outer");
    });
  });

  it("are gone once the work is over, and work it started later keeps its own domain's", async () => {
    let later: Promise<unknown> | undefined;
    await runWithAutomationStudioDomainReadings(of("mine"), async () => {
      later = tick().then(said);
    });
    expect(said()).toBeUndefined();
    expect(await later).toBe("mine");
  });
});
