import { humannessRandom, humannessSeedOf, normalizeHumanness } from "@fluxiq/contracts/runtime";

/**
 * How long a run holds still before it first arrives at a node, at a humanness
 * level (H2). Pure: the level, the run's seed, the node and the arrival's
 * ordinal in, milliseconds out, so a run with the same seed replays the same
 * pauses and nothing is shared between nodes.
 *
 * With b = level / 100 and three draws from `humannessRandom(humannessSeedOf("seed:node:ordinal"))`:
 * - body: 800 * b * E ms, E exponential with mean 1 (`-ln(1 - u1)`), so most moments are short and a few long;
 * - reading pause: with chance 0.2 * b (u2), an extra 2000 * b * (0.5 + u3) ms, mean 2 s at level 100;
 * - total = round(1000 * b * (0.8 * E + (u2 < 0.2 * b ? 2 * (0.5 + u3) : 0))).
 * The mean is 1000 * b * (0.8 + 0.4 * b): about 8 ms at level 1, about 1.2 s at 100,
 * and the chance of a reading pause (mean 2 s at 100) grows from 0.2% to 20%.
 * Level 0 (or anything normalising to it) is 0 ms.
 *
 * `minStepGapMs` is a developer's run override (W3's `pace.minStepGapMs`, the least gap
 * between two steps): when set, the pause is at least that long, at every level, level 0
 * included. Absent, it changes nothing, so level 0 with no override is 0 ms.
 */
export function automationStudioHumanPauseMs(level: number | undefined, seed: number, nodeId: string, ordinal: number, minStepGapMs?: number): number {
  const floor = typeof minStepGapMs === "number" && Number.isFinite(minStepGapMs) && minStepGapMs > 0 ? Math.round(minStepGapMs) : 0;
  const b = normalizeHumanness(level) / 100;
  if (!(b > 0)) return floor;
  const next = humannessRandom(humannessSeedOf(`${seed}:${nodeId}:${ordinal}`));
  const body = -Math.log(1 - next()), reads = next() < 0.2 * b, extra = 2 * (0.5 + next());
  return Math.max(floor, Math.round(1000 * b * (0.8 * body + (reads ? extra : 0))));
}
