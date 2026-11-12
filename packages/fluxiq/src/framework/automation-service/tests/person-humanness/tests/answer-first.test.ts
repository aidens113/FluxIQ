// @fluxiq-test-group real-sql
// An answer-first chat attempt through the real service, engine and a scripted model starts from the
// request's humanness when it carries one, else from the caller's own stored starting value
// (`AutomationStudioPersonHumanness`, bound as the host binds identity-access's reader), else none:
// seen on what the new task keeps (`../../../service/answer-first/attempt/run-attempt.ts` stores the
// attempt's starting value on a task with none). Provider-free.
import { afterEach, describe, expect, it, vi } from "vitest";
import { laterAttempts, readLoans } from "../../../service/answer-first/tests/later-attempts.ts";
import { AutomationStudioPersonHumanness } from "../../../service/person-humanness/index.ts";
import { caller } from "../../service-bootstrap/tests/fixtures.ts";

vi.setConfig({ testTimeout: 180_000 });

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});

const firstAttempt = { script: [readLoans(), { kind: "complete", result: { summary: "Listed." } }] };

/** A first attempt by a caller whose stored starting value is `stored`, with the request carrying `requested`: what the task kept, and whom the reader was asked about. */
async function firstAttemptWith(requested: number | undefined, stored: number | null | "unbound") {
  const lane = await laterAttempts(cleanups);
  const reads: string[] = [];
  if (stored !== "unbound") {
    AutomationStudioPersonHumanness.bind(lane.service, (userId) => {
      reads.push(userId);
      return stored;
    });
  }
  const first = await lane.attempt({ ...firstAttempt, ...(requested === undefined ? {} : { humanness: requested }) });
  expect(first.answer.attempt).toMatchObject({ status: "achieved", path: "explore", ordinal: 1 });
  return { kept: await lane.kept(), reads };
}

describe("an answer-first chat attempt's starting humanness", () => {
  it("uses the person's stored value when the request carries none, read for the signed-in caller", async () => {
    const seen = await firstAttemptWith(undefined, 65);
    expect(seen.kept?.humanness).toBe(65);
    expect(seen.reads).toEqual([caller().actorUserId]);
  });

  it("takes a stored 0 as the person's level", async () => {
    expect((await firstAttemptWith(undefined, 0)).kept?.humanness).toBe(0);
  });

  it("takes the request's value over the person's, without reading the person's", async () => {
    const seen = await firstAttemptWith(30, 65);
    expect(seen.kept?.humanness).toBe(30);
    expect(seen.reads).toEqual([]);
  });

  it("has none when neither the request nor the person set one", async () => {
    const unset = await firstAttemptWith(undefined, null);
    expect(unset.kept).not.toHaveProperty("humanness");
    const unbound = await firstAttemptWith(undefined, "unbound");
    expect(unbound.kept).not.toHaveProperty("humanness");
  });
});
