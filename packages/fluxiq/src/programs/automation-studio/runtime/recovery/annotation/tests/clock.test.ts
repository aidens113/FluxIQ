import { expect, it, vi } from "vitest";
import { annotate, explorationStage } from "./annotate-harness.ts";

it("starts recovery and exploration on the pinned original environment clock and timer pair", async () => {
  const waits: Array<{ kind: string; delayMs: number }> = [];
  const cancel = vi.fn();
  const clock = {
    current: 2_500,
    now() {
      expect(this).toBe(clock);
      return this.current;
    },
    startTimer(wait: { readonly kind: string }, delayMs: number, _fire: () => void) {
      expect(this).toBe(clock);
      waits.push({ kind: wait.kind, delayMs });
      return { cancel };
    }
  };
  let replaced = false;
  const executed: string[] = [];
  const detail = await annotate({
    executed,
    graphOptions: {
      clock,
      now: () => { throw new Error("legacy clock must not replace the environment clock"); },
      startTimer: () => { throw new Error("region timer must not serve exploration"); }
    },
    onProvider: () => {
      if (replaced) return;
      replaced = true;
      clock.current += 250;
      clock.now = () => { throw new Error("clock method changed after recovery began"); };
      clock.startTimer = () => { throw new Error("timer method changed after recovery began"); };
    }
  });
  expect(executed).toEqual(["test.inspect"]);
  expect(explorationStage(detail)).toMatchObject({ status: "completed" });
  expect(waits).toEqual([{ kind: "exploration_timeout", delayMs: 599_750 }]);
  expect(cancel).toHaveBeenCalledTimes(1);
});

it("retains the legacy graph clock fallback without using its region-only timer", async () => {
  const graphOptions = {
    now() {
      expect(this).toBe(graphOptions);
      return 4_000;
    },
    startTimer: () => { throw new Error("region-only timer is not an exploration timer"); }
  };
  const detail = await annotate({ executed: [], graphOptions });
  expect(explorationStage(detail)).toMatchObject({ status: "completed" });
});
