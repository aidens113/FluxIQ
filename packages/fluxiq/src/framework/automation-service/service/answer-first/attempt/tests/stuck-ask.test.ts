// The stuck attempt's question (`../stuck-ask.ts`, R7 revision): posted as an open question that
// does not park, never waited on, one open at a time, the person's words heard whenever they come,
// and closed with the attempt.
import { describe, expect, it } from "vitest";
import type { AutomationStudioAsk, AutomationStudioAskAnswer, AutomationStudioParkingPort } from "../../../../../../runtime/automation-parking/index.ts";
import { automationStudioAnswerFirstStuckAsking } from "../stuck-ask.ts";

/** A port whose answers the test releases by hand, as a person answering later would. */
function port() {
  const opened: AutomationStudioAsk[] = [];
  const waits: Array<{ signal?: AbortSignal | undefined; answer(value: Partial<AutomationStudioAskAnswer> | undefined): void; fail(error: unknown): void }> = [];
  const asked: AutomationStudioParkingPort = {
    open: (ask) => { opened.push(ask); },
    awaitAnswer: (_ask, wait) => new Promise((resolve, reject) => {
      const settle = (value: Partial<AutomationStudioAskAnswer> | undefined) => resolve(value === undefined ? undefined : { askId: "a", answeredAt: 1, actorId: "person", value: null, kind: "text", ...value } as AutomationStudioAskAnswer);
      // As the conversation port does: a wait whose signal fires closes the question and answers nothing.
      wait.signal?.addEventListener("abort", () => settle(undefined), { once: true });
      waits.push({ signal: wait.signal, answer: settle, fail: reject });
    })
  };
  return { asked, opened, waits };
}

const asking = (given: AutomationStudioParkingPort | undefined, signal?: AbortSignal) => {
  const heard: string[] = [];
  const failed: unknown[] = [];
  const channel = automationStudioAnswerFirstStuckAsking({ port: given, signal, heard: (words) => heard.push(words), failed: (error) => failed.push(error) });
  return { channel, heard, failed };
};

describe("the stuck attempt's question", () => {
  it("posts an open question that does not park, with no clock, and returns before any answer", async () => {
    const { asked, opened, waits } = port();
    const { channel, heard } = asking(asked);
    await expect(channel.post("What is stuck: this.")).resolves.toBe(true);
    expect(opened[0]).toMatchObject({ kind: "open", parks: false, timeoutMs: null, onTimeout: null, options: null, text: "What is stuck: this.", control: { kind: "stuck_in_a_loop" } });
    expect(waits).toHaveLength(1);
    expect(channel.open()).toBe(true);
    expect(heard).toEqual([]);
    await channel.close();
  });

  it("hears the person's words whenever they come, and may ask again after", async () => {
    const { asked, opened, waits } = port();
    const { channel, heard } = asking(asked);
    await channel.post("Q1");
    // A later loop while it is unanswered posts nothing more.
    await expect(channel.post("Q2")).resolves.toBe(false);
    expect(opened).toHaveLength(1);
    waits[0]!.answer({ value: "  Look under the second tab.  " });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(heard).toEqual(["Look under the second tab."]);
    expect(channel.open()).toBe(false);
    await expect(channel.post("Q3")).resolves.toBe(true);
    expect(opened.map((ask) => ask.text)).toEqual(["Q1", "Q3"]);
    await channel.close();
  });

  it("closes an open question with the attempt, hearing nothing and failing nothing", async () => {
    const { asked, waits } = port();
    const { channel, heard, failed } = asking(asked);
    await channel.post("Q");
    await channel.close();
    expect(waits[0]!.signal?.aborted).toBe(true);
    expect(channel.open()).toBe(false);
    expect(heard).toEqual([]);
    expect(failed).toEqual([]);
    await expect(channel.post("Q again")).resolves.toBe(false);
  });

  it("ends the wait on the person's Stop", async () => {
    const { asked, waits } = port();
    const stop = new AbortController();
    const { channel } = asking(asked, stop.signal);
    await channel.post("Q");
    stop.abort();
    expect(waits[0]!.signal?.aborted).toBe(true);
    await channel.close();
  });

  it("hears nothing from an empty answer or another kind of answer", async () => {
    for (const answer of [{ value: "   " }, { kind: "choice" as const, value: "x" }]) {
      const { asked, waits } = port();
      const { channel, heard } = asking(asked);
      await channel.post("Q");
      waits[0]!.answer(answer);
      await channel.close();
      expect(heard, JSON.stringify(answer)).toEqual([]);
    }
  });

  it("says a question it could not post or read, and never throws", async () => {
    const { channel, failed } = asking({ open: () => { throw new Error("no thread"); }, awaitAnswer: async () => undefined });
    await expect(channel.post("Q")).resolves.toBe(false);
    expect(failed).toHaveLength(1);
    const { asked, waits } = port();
    const reading = asking(asked);
    await reading.channel.post("Q");
    waits[0]!.fail(new Error("thread unreadable"));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(reading.failed).toHaveLength(1);
    await reading.channel.close();
  });

  it("asks nobody where nobody can answer", async () => {
    let opened = 0;
    await expect(asking({ open: () => { opened += 1; } }).channel.post("Q")).resolves.toBe(false);
    await expect(asking(undefined).channel.post("Q")).resolves.toBe(false);
    expect(opened).toBe(0);
  });
});
