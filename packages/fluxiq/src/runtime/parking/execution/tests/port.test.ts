import { expect, it } from "vitest";
import { observationFixture } from "../../../execution-observation/tests/fixture.ts";
import type { AutomationStudioAsk, AutomationStudioParkingPort } from "../../index.ts";
import { observeExecutionParkingPort } from "../index.ts";

const ask: AutomationStudioAsk = { askId: "question.original", kind: "confirm", parks: true, status: "pending", text: "Continue?", raisedBy: { stage: "authoring" } };

it("pins and observes original port methods, receivers and tuples before actual acknowledged work", async () => {
  const f = await observationFixture();
  const acknowledged = new WeakSet<Promise<void>>();
  const writes: string[] = [];
  let answers = 0;
  const wait = {};
  const port: AutomationStudioParkingPort = {
    open(actual) {
      expect(this).toBe(port);
      expect(actual).toBe(ask);
      expect([...f.store.rows.values()].some(row => row.row.sourceKey === "test.callbacks" && !row.closed)).toBe(true);
      const original = Promise.resolve().then(() => {
        writes.push(actual.askId);
        acknowledged.add(original);
      });
      return original;
    },
    async awaitAnswer(actual, options) {
      expect(this).toBe(port);
      expect(actual).toBe(ask);
      expect(options).toBe(wait);
      answers += 1;
      return { askId: actual.askId, kind: "grant", value: null, answeredAt: 1, actorId: null };
    }
  };
  const open = port.open;
  const answer = port.awaitAnswer;
  if (!answer) throw new Error("test.original_answer_required");
  f.source.manage({ receiver: port, callback: open, contract: "managed_direct_effects", consumeCompletion: input => {
    if (!(input.returned instanceof Promise) || !acknowledged.delete(input.returned) || input.outcome.kind !== "fulfilled" || input.outcome.value !== undefined) return null;
    return { disposition: "settled", completionDigest: "test.original_question.ack", assessmentDigest: "test.original_question.finished" };
  } });
  f.source.manage({ receiver: port, callback: answer, contract: "no_direct_effects" });
  const observed = observeExecutionParkingPort(f.source, f.parent, port);
  port.open = () => { throw new Error("replacement open invoked"); };
  port.awaitAnswer = async () => { throw new Error("replacement answer invoked"); };
  await observed.open(ask);
  await expect(observed.awaitAnswer?.(ask, wait)).resolves.toMatchObject({ kind: "grant", askId: ask.askId });
  expect(writes).toEqual([ask.askId]);
  expect(answers).toBe(1);
  expect([...f.store.rows.values()].filter(row => row.row.sourceKey === "test.callbacks").every(row => row.closed)).toBe(true);
});

it("does not let an unsupported fulfilled question write authorize a second callback", async () => {
  const f = await observationFixture();
  let writes = 0;
  let answers = 0;
  const port: AutomationStudioParkingPort = {
    open() { writes += 1; },
    async awaitAnswer(actual) {
      answers += 1;
      return { askId: actual.askId, kind: "grant", value: null, answeredAt: 1, actorId: null };
    }
  };
  const observed = observeExecutionParkingPort(f.source, f.parent, port);
  await observed.open(ask);
  await expect(observed.awaitAnswer?.(ask, {})).rejects.toThrow();
  expect(writes).toBe(1);
  expect(answers).toBe(0);
  expect((await f.authority.consumer.inspect(f.scope)).state).toBe("pending");
});

it("retains the original write error and prevents a new reservation from treating it as completion", async () => {
  const f = await observationFixture();
  const error = new Error("question write lost acknowledgement");
  let writes = 0;
  const observed = observeExecutionParkingPort(f.source, f.parent, { open() {
    writes += 1;
    throw error;
  } });
  await expect(observed.open(ask)).rejects.toBe(error);
  await f.authority.consumer.release(f.reserved.reservation);
  const origin = f.root.origin();
  const grant = f.rootPorts.issuer.fromOrdinaryAdmission(f.root.admit(origin));
  await expect(f.authority.consumer.reserve(f.scope, grant)).rejects.toThrow("store.blocked");
  expect(writes).toBe(1);
  expect((await f.authority.consumer.inspect(f.scope)).state).toBe("pending");
});
