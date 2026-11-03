import { expect, it } from "vitest";
import { OriginalExecutionPromiseReceipts } from "../../../execution-observation/queue-completion/index.ts";
import { observationFixture } from "../../../execution-observation/tests/fixture.ts";
import type { ModelExecutionOptions } from "../../../models/execution/index.ts";
import { invokePreparedInstructionModelRun, prepareInstructionModelRun } from "../index.ts";

it("retains an already acknowledged original runner result without reopening its settled invocation", async () => {
  const f = await observationFixture();
  const receipts = new OriginalExecutionPromiseReceipts();
  const request = Object.freeze({ operation: "controlled retained instruction reading" });
  const answer = Object.freeze({ reading: "controlled retained result" });
  let original: Promise<typeof answer> | undefined;
  const receiver = {
    run(given: typeof request, execution?: ModelExecutionOptions): Promise<typeof answer> {
      expect(this).toBe(receiver);
      expect(given).toBe(request);
      const observation = execution?.observation;
      if (!observation) throw new Error("The original runner requires its actual entered observation.");
      const returned = Promise.resolve().then(() => {
        receipts.issueObserved(returned, observation, { disposition: "settled", completionDigest: "controlled.read.ack", assessmentDigest: "controlled.read.no_pending_work" });
        return answer;
      });
      original = returned;
      return returned;
    }
  };
  f.source.manage({ receiver, callback: receiver.run, contract: "managed_direct_effects", consumeCompletion(input) {
    expect(input.returned).toBe(original);
    return receipts.consume(input);
  } });
  const invocation = await prepareInstructionModelRun(f.observation, receiver, receiver.run, request, f.source);
  expect(await invokePreparedInstructionModelRun(invocation)).toBe(answer);
  expect(invocation.completion()).toBe("settled");
  await f.rootPorts.producer.finish(f.reserved.root, f.root.complete(f.origin));
  await f.authority.consumer.release(f.reserved.reservation);
  expect((await f.authority.consumer.inspect(f.scope)).state).toBe("clear");
});

it("preserves the first managed unknown result and keeps another callback fenced", async () => {
  const f = await observationFixture();
  const request = Object.freeze({ operation: "controlled unknown instruction reading" });
  const answer = Object.freeze({ reading: "returned without acknowledged completion" });
  let calls = 0;
  const receiver = { async run(_request: typeof request) {
    calls++;
    return answer;
  } };
  f.source.manage({ receiver, callback: receiver.run, contract: "managed_direct_effects", consumeCompletion: () => ({ disposition: "unknown", code: "controlled.read.completion_unknown" }) });
  const invocation = await prepareInstructionModelRun(f.observation, receiver, receiver.run, request, f.source);
  expect(await invokePreparedInstructionModelRun(invocation)).toBe(answer);
  expect(invocation.completion()).toBe("unknown");
  await expect(prepareInstructionModelRun(f.observation, receiver, receiver.run, request, f.source)).rejects.toThrow();
  expect(calls).toBe(1);
  await f.authority.consumer.release(f.reserved.reservation);
  expect((await f.authority.consumer.inspect(f.scope)).state).toBe("pending");
});
