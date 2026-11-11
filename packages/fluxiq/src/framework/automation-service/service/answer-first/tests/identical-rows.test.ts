// @fluxiq-test-group real-sql
// Two rows nobody can tell apart (t870). Refusing is right, and a model that keeps pressing them, each
// time by a new handle, is caught with money still there, steered onto a different way and the person
// asked, without waiting (R7: a task ends only with its result, its budget or a Stop): through the real service, with a scripted model and a lending library. A model pressing rows
// that really are new is not a loop (the plan's "what is not a loop"). What a look shows is the script's
// to read, never Core's.
import { afterEach, describe, expect, it, vi } from "vitest";
import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioLlmEvidenceRuntimeBinding, AutomationStudioLlmTaskRequest } from "../../../../../runtime/llm/index.ts";
import { keptAttempt, pendingAsk } from "./endings/support.ts";
import { LOANS_OUTPUT } from "./fake-library-engine.ts";
import { complete, fakeLibrary, fakeLibraryBinding, READ_LOANS, RENEW_LOAN, runNode, scriptedAttempt, toolCall, type FakeLibraryFault } from "./fake-library.ts";
import { LOAN_TASK, PERMITTED } from "./honest-attempts.ts";
import { readLoans } from "./later-attempts.ts";
import { ATLAS, BIRDS, CLOCKS, DUNES, RENEW, siteLane, type LibrarySite } from "./library-site.ts";

vi.setConfig({ testTimeout: 180_000 });

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup(); });

const ALREADY_DONE = "attempt.act_already_done";
const ROW_UNCLEAR = "attempt.act_row_unclear";
/** About eighty decisions' worth at what one costs here (`./later-attempts.ts`): unseen, these refusals spend all of it and end `budget_out`, well inside the script. */
const BUDGET_USD = 0.08;
const STUCK = "stuck_in_a_loop";
const handleOf = (call: { value: JsonObject }) => (call.value.parameters as { target?: { handle?: string } } | undefined)?.target?.handle;
const pressBy = (handle: string, over: JsonObject = {}) => runNode(`press.${handle}`, RENEW_LOAN, { target: { handle } }, ["modify_existing"], over);
/** Every press by a new handle, on a site where each names a control the domain calls by this row's words. */
const sameRowEveryTime = (site: LibrarySite, words: string) => {
  site.says = (call) => handleOf(call) ? { target: words } : undefined;
  const pressed = (at: number) => {
    site.handles.set(`t${at}`, ATLAS);
    return pressBy(`t${at}`);
  };
  return pressed;
};
const shownIn = (request: AutomationStudioLlmTaskRequest) => JSON.stringify(request.context.evidenceLoop?.evidence ?? []);
const started = <Run>(run: Promise<Run>): Promise<Run> => {
  run.catch(() => undefined);
  return run;
};

describe("a model that keeps pressing a row it cannot tell from one done", () => {
  /** Two loans of one title, one renewed by hand, then the other's press again and again, until `keepGoing` decides otherwise. */
  const stuckLane = async (keepGoing: (request: AutomationStudioLlmTaskRequest) => JsonObject | undefined) => {
    const { lane, site, target } = await siteLane(cleanups, { titles: [ATLAS, ATLAS, BIRDS] });
    const shown: string[] = [];
    const pressed = sameRowEveryTime(site, `${RENEW} ${ATLAS}`);
    let at = 0;
    const decide = (request: AutomationStudioLlmTaskRequest): JsonObject => {
      shown.push(shownIn(request));
      return keepGoing(request) ?? pressed((at += 1));
    };
    const running = started(lane.attempt({ instruction: LOAN_TASK, ...PERMITTED, maxTotalEstimatedCostUsd: BUDGET_USD, keepLooking: true, script: [readLoans(), ...Array.from({ length: 300 }, () => decide)] }));
    return { lane, target, shown, running, decisions: () => at };
  };
  /** Waits until `holds`, as the attempt goes on by itself. */
  const until = async (holds: () => boolean): Promise<void> => {
    for (let tries = 0; tries < 2_000 && !holds(); tries += 1) await new Promise((resolve) => setTimeout(resolve, 10));
    expect(holds()).toBe(true);
  };

  // R7 revision: the last rung steers the next round onto a different way and asks without waiting; it never parks.
  it("asks the person with their money still there, never waits on them, and a Stop ends it, with nothing pressed twice", async () => {
    const { lane, target, shown, running, decisions } = await stuckLane(() => undefined);
    const ask = await pendingAsk(lane.service, lane.projectId, "flow.loans", STUCK);
    expect(ask.kind).toBe("open");
    expect(ask.timeoutMs).toBeNull();
    const kept = await keptAttempt(lane.service, lane.projectId, "flow.loans");
    expect(kept?.attempt.status).toBe("working");
    expect(kept?.attempt).not.toHaveProperty("waitingFor");
    expect(kept?.attempt.spend.usd).toBeLessThan(BUDGET_USD);
    // Nothing waits on the question: the model is asked again, on a round steered onto a different way.
    const askedAtTheAsk = decisions();
    await until(() => shown.some((words) => words.includes("loopStopped")));
    await until(() => decisions() > askedAtTheAsk);
    lane.service.buildCancellation.cancel(lane.projectId, "flow.loans");
    const stopped = await running;
    expect(stopped.answer.attempt.status).toBe("stopped_by_person");
    expect(stopped.answer.attempt.spend.usd).toBeLessThan(BUDGET_USD);
    // The first of them went, and no other: refusing is right.
    expect(target.library.renewals[ATLAS]).toBe(1);
    expect(shown.join()).toContain(ROW_UNCLEAR);
    expect(shown.join()).toContain("Read something that tells these rows apart");
    expect(Object.values(stopped.answer.attempt.loopsCaught).reduce((sum, each) => sum + each.askPerson, 0)).toBeGreaterThanOrEqual(1);
  });

  it("a person's answer reaches a later round, on the same budget, and the model can say what it has", async () => {
    const ANSWER = "Say what you have done and what you could not tell apart.";
    const { lane, target, running } = await stuckLane((request) => shownIn(request).includes(ANSWER) ? complete("I renewed one of the two with this title and could not tell which the other is.") : undefined);
    const ask = await pendingAsk(lane.service, lane.projectId, "flow.loans", STUCK);
    await lane.service.conversations.answerAsk({ projectId: lane.projectId, askId: ask.askId, kind: "text", value: ANSWER });
    const finished = await running;
    expect(finished.answer.attempt.status).toBe("achieved");
    expect(finished.answer.attempt.spend.usd).toBeLessThan(BUDGET_USD);
    expect(target.library.renewals[ATLAS]).toBe(1);
  });

  it("the same known row by new handles is asked about too, in the plain words", async () => {
    const { lane, site, target } = await siteLane(cleanups);
    const pressed = sameRowEveryTime(site, `${RENEW} ${ATLAS}`);
    const shown: string[] = [];
    let at = 0;
    const running = started(lane.attempt({ instruction: LOAN_TASK, ...PERMITTED, maxTotalEstimatedCostUsd: BUDGET_USD, keepLooking: true, script: [readLoans(), ...Array.from({ length: 300 }, () => (request: AutomationStudioLlmTaskRequest) => {
      shown.push(shownIn(request));
      return pressed((at += 1));
    })] }));
    await pendingAsk(lane.service, lane.projectId, "flow.loans", STUCK);
    lane.service.buildCancellation.cancel(lane.projectId, "flow.loans");
    await running;
    expect(target.library.renewals[ATLAS]).toBe(1);
    expect(shown.join()).toContain(ALREADY_DONE);
    expect(shown.join()).not.toContain(ROW_UNCLEAR);
  });
});

describe("a model told to read that reads and presses the same again", () => {
  it("is asked about on a page that changes by itself: a clock on the page is no progress on the act", async () => {
    const { lane, site, target } = await siteLane(cleanups, { titles: [ATLAS, ATLAS, BIRDS] });
    const pressed = sameRowEveryTime(site, `${RENEW} ${ATLAS}`);
    let at = 0;
    const decide = () => {
      at += 1;
      if (at % 2 === 0) return pressed(at);
      // A page that moves between every look, so each read lands on a state never seen.
      target.library.shelf = `open at minute ${at}`;
      return runNode(`read.${at}`, READ_LOANS, { recordOutput: LOANS_OUTPUT, asking: at });
    };
    const running = started(lane.attempt({ instruction: LOAN_TASK, ...PERMITTED, maxTotalEstimatedCostUsd: BUDGET_USD, keepLooking: true, script: [readLoans(), pressed(0), ...Array.from({ length: 300 }, () => decide)] }));
    await pendingAsk(lane.service, lane.projectId, "flow.loans", STUCK);
    // Caught with money still there; it goes on spending after (R7), so the row is read at the ask, not later.
    expect((await keptAttempt(lane.service, lane.projectId, "flow.loans"))?.attempt.spend.usd).toBeLessThan(BUDGET_USD);
    lane.service.buildCancellation.cancel(lane.projectId, "flow.loans");
    await running;
    expect(target.library.renewals[ATLAS]).toBe(1);
  });

  it("is asked about all the same: a read that brings nothing new is no progress, whatever handles it mints", async () => {
    const { lane, site, target } = await siteLane(cleanups, { titles: [ATLAS, ATLAS, BIRDS] });
    const pressed = sameRowEveryTime(site, `${RENEW} ${ATLAS}`);
    let at = 0;
    // Each read is asked differently, so each really runs and mints handles of its own: one asked the same again would be answered from memory.
    const decide = () => (at += 1) % 2 === 0 ? pressed(at) : runNode(`read.${at}`, READ_LOANS, { recordOutput: LOANS_OUTPUT, asking: at });
    const running = started(lane.attempt({ instruction: LOAN_TASK, ...PERMITTED, maxTotalEstimatedCostUsd: BUDGET_USD, keepLooking: true, script: [readLoans(), pressed(0), ...Array.from({ length: 300 }, () => decide)] }));
    await pendingAsk(lane.service, lane.projectId, "flow.loans", STUCK);
    // Caught with money still there; it goes on spending after (R7), so the row is read at the ask, not later.
    expect((await keptAttempt(lane.service, lane.projectId, "flow.loans"))?.attempt.spend.usd).toBeLessThan(BUDGET_USD);
    lane.service.buildCancellation.cancel(lane.projectId, "flow.loans");
    await running;
    expect(target.library.renewals[ATLAS]).toBe(1);
  });
});

describe("what is not a loop", () => {
  it("presses on rows that really are new, each by a new handle, run on to the result and are never steered, refused or asked about", async () => {
    // More of them than the window of no progress, which they must never reach.
    const titles = [ATLAS, BIRDS, CLOCKS, DUNES, "Ferns", "Glaciers", "Harbours", "Islands", "Jetties", "Kites", "Lanterns", "Maps", "Nests", "Orchards"];
    const { lane, site, target } = await siteLane(cleanups, { titles });
    site.says = (call) => {
      const handle = handleOf(call);
      return handle ? { target: `${RENEW} ${site.handles.get(handle) ?? ""}` } : undefined;
    };
    const presses = titles.map((title, at) => (request: AutomationStudioLlmTaskRequest) => {
      expect(shownIn(request)).not.toContain("core.loop_check");
      site.handles.set(`t${at}`, title);
      return pressBy(`t${at}`);
    });
    const finished = await lane.attempt({ instruction: LOAN_TASK, ...PERMITTED, script: [readLoans(), ...presses, complete("Renewed every loan.")] });
    expect(finished.answer.attempt.status).toBe("achieved");
    expect(target.library.renewals).toEqual(Object.fromEntries(titles.map((title) => [title, 1])));
    const caught = Object.values(finished.answer.attempt.loopsCaught);
    expect(caught.reduce((sum, each) => sum + each.steered + each.refused + each.changeApproach + each.askPerson, 0)).toBe(0);
    expect(lane.said.join()).not.toContain("Noticed it was repeating itself");
  });
});

describe("a repair harness's tools on the attempt path", () => {
  const RECOVERY_PRESS = "library.recovery.press";
  const withRecovery = (fault?: FakeLibraryFault): { binding: AutomationStudioLlmEvidenceRuntimeBinding; ran: string[] } => {
    const library = fakeLibrary();
    const ran: string[] = [];
    const binding: AutomationStudioLlmEvidenceRuntimeBinding = {
      ...fakeLibraryBinding(library, fault),
      harnessOptions: {
        schemaVersion: "0.1", domainId: "library",
        options: [{ toolId: RECOVERY_PRESS, description: "Press in a repair.", inputSchema: { type: "object" }, effect: "mutate", availability: { kind: "domain", domainId: "library" }, safety: { sideEffect: "mutate" }, stages: ["gather", "iterate"] }],
        implementations: {
          [RECOVERY_PRESS]: async () => {
            ran.push(RECOVERY_PRESS);
            return { ok: true };
          }
        }
      }
    };
    return { binding, ran };
  };

  it("a tool pinned to a repair's stages is not offered to an attempt's model, and asking for it runs nothing", async () => {
    const { binding, ran } = withRecovery();
    const offered: string[][] = [];
    const attempt = await scriptedAttempt({
      over: { llmEvidenceRuntime: binding },
      script: [
        (request) => {
          offered.push((request.context.evidenceLoop?.tools ?? []).map((tool) => tool.toolId));
          return toolCall("press.recovery", RECOVERY_PRESS, { target: "t1", consequences: ["modify_existing"] });
        },
        runNode("read", READ_LOANS, {}, [], { add: true }),
        complete("Listed.")
      ]
    }, cleanups);
    expect(offered[0]).toContain("core.run_node");
    expect(offered[0]).not.toContain(RECOVERY_PRESS);
    expect(ran).toEqual([]);
    expect(attempt.answered.status).toBe("answered");
  });
});
