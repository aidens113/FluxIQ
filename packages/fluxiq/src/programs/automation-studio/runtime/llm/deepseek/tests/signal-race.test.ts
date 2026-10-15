import { describe, expect, it } from "vitest";
import { readAutomationStudioDeepSeekBoundedResponse } from "../bounded-read.ts";
import { raceAutomationStudioDeepSeekSignal } from "../signal-race.ts";

// t617: a read that begins after its call's signal fired must end as the call's
// timeout, even when the body already holds a chunk. Before, the settled read
// won the race, the reader was cancelled, the next read said `done`, and a body
// that never finished read as a complete one.
describe("a DeepSeek read under an aborted signal", () => {
  it("ends as a timeout and releases what it holds, even when the work has already settled", async () => {
    const controller = new AbortController();
    controller.abort(new DOMException("timed out", "TimeoutError"));
    let released = false;
    await expect(raceAutomationStudioDeepSeekSignal(Promise.resolve("buffered"), controller.signal, () => { released = true; }))
      .rejects.toMatchObject({ code: "llm.provider_timeout", retryable: true });
    expect(released).toBe(true);
  });

  it("does not read a buffered chunk of an unfinished body as the whole body", async () => {
    let cancelled = false;
    const unfinished = new ReadableStream<Uint8Array>({
      start(stream) { stream.enqueue(new TextEncoder().encode("\n")); },
      cancel() { cancelled = true; }
    });
    const controller = new AbortController();
    controller.abort(new DOMException("timed out", "TimeoutError"));
    await expect(readAutomationStudioDeepSeekBoundedResponse(new Response(unfinished, { status: 500 }), 1_024, controller.signal))
      .rejects.toMatchObject({ code: "llm.provider_timeout" });
    expect(cancelled).toBe(true);
  });
});
