import type { ExecutionScopeBinding, ExecutionScopeOwner } from "../index.ts";

export class AdmissionTestScopeOwner implements ExecutionScopeOwner {
  readonly #proofs = new WeakMap<object, ReturnType<ExecutionScopeOwner["readBinding"]>>();
  readonly calls: object[] = [];

  issue(continuationKey = "flow.persisted", baseline: "complete" | "unverified" = "complete"): object {
    const proof = Object.freeze({});
    const binding: ExecutionScopeBinding = { projectId: "project.isolated", ownerKey: "test.owner", continuationKey, resourceKeys: ["resource.isolated"], coverageEpoch: "coverage.v1" };
    this.#proofs.set(proof, { binding, baseline, baselineProofDigest: "actual.baseline" });
    return proof;
  }

  readBinding(proof: object): ReturnType<ExecutionScopeOwner["readBinding"]> {
    this.calls.push(proof);
    return this.#proofs.get(proof) ?? null;
  }
}
