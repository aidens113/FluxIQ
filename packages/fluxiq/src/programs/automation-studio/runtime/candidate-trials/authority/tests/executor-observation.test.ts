import { describe, expect, it, vi } from "vitest";
import { bindAutomationExecutionObservation, createAutomationExecutionAdmissionSource, hasAutomationExecutionObservation } from "../../../../../../engine/automation/execution-admission/index.ts";
import type { AutomationStudioGraphExecutionOptions } from "../../../../../../engine/automation/contracts/index.ts";
import type { OrdinaryExecutionRunBindingReader } from "../../../../../../runtime/output-dispatch/admission/index.ts";
import type { ExecutionObservationContext } from "../../../../../../runtime/execution-admission/index.ts";
import { AdmissionTestSource } from "../../../../../../runtime/execution-admission/tests/source.ts";
import { bindPartialTrialContext } from "../../partial/index.ts";
import { inheritCandidateTrialExecutorObservation } from "../index.ts";
import { candidateAdmissionFixture } from "./fixture.ts";

describe("trial option copies preserve original observation ownership", () => {
  it.each([true, false])("forwards the actual callback parent with original-bound=%s", async bound => {
    const f = await candidateAdmissionFixture({ noDispatch: true, port: async request => ({ revision: request.revision, digest: request.digest, verdict: "unsure", feedback: {} }) });
    const automation = createAutomationExecutionAdmissionSource(f.scope);
    automation.connect(f.assembly.registerSource(automation.registration([automation.owner])));
    const root = new AdmissionTestSource(f.scope, "actual.copy.parent");
    root.delegatesTo.push(f.callbacks.owner, automation.owner);
    const ports = f.assembly.registerSource(root);
    const origin = root.origin();
    const reserved = await f.assembly.consumer.reserve(f.scope, ports.issuer.fromOrdinaryAdmission(root.admit(origin)));
    const outer = { reservation: reserved.reservation, parent: reserved.root };
    const receiver = { read: () => "actual local reading" };
    f.callbacks.manage({ receiver, callback: receiver.read, contract: "no_direct_effects" });
    const call = { receiver, callback: receiver.read, args: [] as [] };
    const prepared = await f.callbacks.prepare(f.callbacks.forParent(outer), call);
    const parent = f.callbacks.context(prepared);
    const input = {};
    bindPartialTrialContext(input, { parent, callbacks: f.callbacks, automation });
    const originalProof = Object.freeze({});
    const rootRow = f.assembly.entryBridge.read(reserved.root).row;
    const actualReads: ExecutionObservationContext[] = [];
    class RunOwner implements OrdinaryExecutionRunBindingReader {
      readonly #proof = originalProof;
      readOrdinaryRunBinding(proof: object, actualParent: ExecutionObservationContext) {
        actualReads.push(actualParent);
        const actual = f.assembly.entryBridge.read(actualParent.parent);
        if (proof !== this.#proof || actualParent.reservation !== reserved.reservation || !f.assembly.entryBridge.matchesReservation(actualParent.parent, reserved.reservation) || actual.row.rootId !== rootRow.rootId || !actual.reservationActive || !rootRow.origin.runId) return null;
        return { kind: "execution_root" as const, owner: { projectId: "project.isolated", flowId: "flow.actual", runId: rootRow.origin.runId } };
      }
    }
    const reader = new RunOwner();
    const base: AutomationStudioGraphExecutionOptions = { signal: new AbortController().signal };
    if (bound) bindAutomationExecutionObservation(base, automation.forRun(outer, originalProof, reader));
    const forRun = vi.spyOn(automation, "forRun");
    const forParent = vi.spyOn(automation, "forParent");
    const replacement = vi.spyOn(reader, "readOrdinaryRunBinding").mockImplementation(() => null);
    const copied = { ...base, referenceNow: 42 };
    inheritCandidateTrialExecutorObservation(input, base, copied);
    expect(hasAutomationExecutionObservation(copied)).toBe(true);
    expect(copied.signal).toBe(base.signal);
    if (bound) {
      expect(forRun).toHaveBeenCalledTimes(1);
      expect(forRun.mock.calls[0]?.[0]).toBe(parent);
      expect(forRun.mock.calls[0]?.[1]).toBe(originalProof);
      expect(actualReads.at(-1)).toBe(parent);
      expect(replacement).not.toHaveBeenCalled();
      expect(forParent).not.toHaveBeenCalled();
    } else {
      expect(forParent).toHaveBeenCalledTimes(1);
      expect(forParent).toHaveBeenCalledWith(parent);
      expect(forRun).not.toHaveBeenCalled();
    }
    await f.callbacks.invoke(prepared, call);
    await ports.producer.finish(reserved.root, root.complete(origin));
    await f.assembly.consumer.release(reserved.reservation);
  });
});
