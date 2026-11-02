import { describe, expect, it } from "vitest";
import type { AutomationStudioSubflowTrialPreparingPort } from "../../../flow-bootstrap/subflow-candidate/index.ts";
import { bindPartialTrialFrame, observePartialTrialCallback } from "../index.ts";
import { partialAdmissionFixture } from "./fixture.ts";

describe("a canonical Flow callback needs its actual engine descendant", () => {
  it.each([false, true])("does not certify empty or only-capture children (capture=%s)", async capture => {
    let captures = 0;
    const reader = { capture() {
      captures += 1;
      return "actual local observation";
    } };
    const callback: AutomationStudioSubflowTrialPreparingPort = async request => {
      if (capture) await observePartialTrialCallback(request, { receiver: reader, callback: reader.capture, args: [] });
      return { partial: true, scope: "subflow", identity: request.proposal.scope, revision: request.proposal.revision, digest: request.proposal.digest,
        verdict: "not_judged", feedback: {}, entryPrepared: false };
    };
    const f = await partialAdmissionFixture({ engine: true, port: callback });
    f.callbacks.manage({ receiver: reader, callback: reader.capture, contract: "no_direct_effects" });
    bindPartialTrialFrame(callback, true);
    expect(await f.gate.test(f.receipt())).toMatchObject({ evidence: { verdict: "not_judged" } });
    expect(captures).toBe(capture ? 1 : 0);
    expect((await f.assembly.consumer.inspect(f.executionScope)).state).toBe("unverified");
    await expect(f.gate.test(f.receipt())).rejects.toThrow();
  });
});
