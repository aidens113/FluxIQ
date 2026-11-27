// @fluxiq-test-group real-sql
// t1075 D: a later attempt carries the earlier attempt's acts as already done, so its replay passes their steps over,
// and its judge is shown, ahead of its own trail, the entries each carried act landed with in the attempt that made it
// (`../run-attempt.ts`, `../../witnesses/carried-evidence.ts`). Seen live in run-mwynbry2-f3c88dc7 (0101): the judge of
// attempt 3 said unsure, as the read its carried press was chosen from was in nothing it was shown.
// Through the real service, the real engine and a scripted model, at a lending library. Provider-free.
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AutomationStudioLlmTaskRequest } from "../../../../../../runtime/llm/index.ts";
import { complete, RENEW_CARD, runNode } from "../../tests/fake-library.ts";
import { laterAttempts, readLoans } from "../../tests/later-attempts.ts";

vi.setConfig({ testTimeout: 180_000 });

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup(); });

const CARD_TASK = "List every loan on my library account and renew the card.";
const cardAttempt = { instruction: CARD_TASK, taskProcessing: { process: {} }, permittedConsequences: ["modify_existing" as const], script: [readLoans(), runNode("card", RENEW_CARD, {}, ["modify_existing"], { add: true }), complete("Done.")] };

type Entry = { did: string; on?: string; found?: unknown };
const entriesOf = (request: AutomationStudioLlmTaskRequest | undefined): Entry[] => (request?.context.resultSummary as unknown as { trail?: { entries?: Entry[] } } | undefined)?.trail?.entries ?? [];

describe("the judge of a later attempt carrying an earlier attempt's acts", () => {
  it("is shown what each carried act landed with, ahead of the attempt's own trail, attempt after attempt", async () => {
    const lane = await laterAttempts(cleanups);
    const first = await lane.attempt(cardAttempt);
    // The first attempt's own judge is shown no carried entries: it carries nothing.
    expect(entriesOf(first.judgeCalls[0]).map((entry) => entry.did)).not.toContain("core.carried_acts_evidence");
    // t1075 B: as the first attempt saved its Flow, its by-hand renewal was named by the step its call became.
    const renewal = (await lane.actsOn())?.acts.find((act) => act.actions.includes(RENEW_CARD));
    expect(renewal?.steps).toEqual([expect.stringMatching(/^step:s\d+$/u)]);
    const second = await lane.attempt({ instruction: CARD_TASK, taskProcessing: { process: {} }, permittedConsequences: ["modify_existing"] });
    expect(lane.target.library.renewals.card).toBe(1);
    expect(second.judgeCalls.length).toBeGreaterThan(0);
    for (const judged of [second.judgeCalls[0]]) {
      const did = entriesOf(judged).map((entry) => entry.did);
      const opened = did.indexOf("core.carried_acts_evidence");
      const closed = did.indexOf("core.carried_acts_evidence_end");
      expect(opened).toBe(0);
      expect(closed).toBeGreaterThan(opened);
      // The carried renewal, and the read the first attempt made before it, as the first attempt's chain recorded them.
      expect(did.slice(opened + 1, closed)).toContain(RENEW_CARD);
      expect(did.slice(opened + 1, closed).length).toBeGreaterThan(1);
    }
    // A third attempt carries the second's record, and through it the first's act: still shown.
    const third = await lane.attempt({ instruction: CARD_TASK, taskProcessing: { process: {} }, permittedConsequences: ["modify_existing"] });
    expect(lane.target.library.renewals.card).toBe(1);
    for (const judged of third.judgeCalls.slice(0, 1)) expect(entriesOf(judged).map((entry) => entry.did)).toContain(RENEW_CARD);
  });
});
