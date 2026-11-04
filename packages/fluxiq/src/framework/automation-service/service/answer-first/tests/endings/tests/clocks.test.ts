// @fluxiq-test-group real-sql
// No clock can end an attempt (the hard rule, and the clocks the model key lane traced). A person
// away for hours while a key is locked looks here like the clock jumping inside a round: the
// build's nine minutes must neither end the attempt nor cost it its round.
import { afterEach, describe, expect, it, vi } from "vitest";
import type { JsonObject } from "../../../../../../../core/index.ts";
import type { AutomationStudioLlmTaskRequest } from "../../../../../../../runtime/llm/index.ts";
import { complete, READ_LOANS, runNode, scriptedAttempt } from "../../fake-library.ts";
import { expectReached, noWaiting } from "../support.ts";

vi.setConfig({ testTimeout: 120_000 });

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const cleanup of cleanups.splice(0)) await cleanup();
});

const noteOf = (request: AutomationStudioLlmTaskRequest): JsonObject | undefined => request.context.evidenceLoop?.evidence.find((entry) => entry.toolId === "core.attempt_note")?.value as JsonObject | undefined;

describe("an attempt and the clock", () => {
  it("hours passing inside a round neither end the attempt nor start a fresh round", async () => {
    const wallClock = Date.now.bind(Date);
    let skewMs = 0;
    vi.spyOn(Date, "now").mockImplementation(() => wallClock() + skewMs);
    const notes: Array<JsonObject | undefined> = [];
    const attempt = await scriptedAttempt({
      before: noWaiting(),
      script: [
        (request: AutomationStudioLlmTaskRequest) => {
          notes.push(noteOf(request));
          skewMs = 3 * 60 * 60 * 1000;
          return runNode("read", READ_LOANS, {}, [], { add: true });
        },
        (request: AutomationStudioLlmTaskRequest) => {
          notes.push(noteOf(request));
          return complete("Listed.");
        }
      ]
    }, cleanups);
    const answer = expectReached(attempt);
    expect(answer.result?.rows?.totalRows).toBe(3);
    // The second decision is the same round's: it carries no fresh round's note.
    expect(notes).toEqual([undefined, undefined]);
  });
});
