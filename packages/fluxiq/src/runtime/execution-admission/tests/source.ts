import type { ExecutionOriginRecord, ExecutionScope, ExecutionSourceRegistration, VerifiedExecutionEvidence } from "../index.ts";

/** Real source-owned registries; equal DTOs are deliberately insufficient. */
export class AdmissionTestSource implements ExecutionSourceRegistration {
  readonly owner: object = this;
  readonly delegatesTo: object[] = [];
  readonly calls: string[] = [];
  readonly #origins = new WeakMap<object, ExecutionOriginRecord>();
  readonly #admissions = new WeakMap<object, { origin: object; callKey: string }>();
  readonly #evidence = new WeakMap<object, { origin: object; value: VerifiedExecutionEvidence }>();
  #ordinal = 0;

  constructor(readonly scope: ExecutionScope, readonly sourceKey: string, readonly rootPolicy: ExecutionSourceRegistration["rootPolicy"] = { kind: "ordinary" }) {}

  origin(operationKey = `operation.${++this.#ordinal}`, runId = "run.actual"): object {
    const origin = Object.freeze({});
    this.#origins.set(origin, { sourceKey: this.sourceKey, operationKey, runId, invocationId: `invocation.${this.#ordinal}`, attemptId: "attempt.actual" });
    return origin;
  }

  admit(origin: object, callKey = `call.${++this.#ordinal}`): object {
    const proof = Object.freeze({});
    this.#admissions.set(proof, { origin, callKey });
    return proof;
  }

  prove(origin: object, value: VerifiedExecutionEvidence): object {
    const proof = Object.freeze({});
    this.#evidence.set(proof, { origin, value });
    return proof;
  }

  complete(origin: object): object {
    return this.prove(origin, { kind: "coverage_complete", disposition: "settled", completionDigest: "actual.completion", assessmentDigest: "actual.assessment" });
  }

  readOrigin(origin: object): ExecutionOriginRecord | null {
    this.calls.push("origin");
    return this.#origins.get(origin) ?? null;
  }

  readOrdinaryAdmission(proof: object): { readonly origin: object; readonly callKey: string } | null {
    this.calls.push("admission");
    const result = this.#admissions.get(proof);
    this.#admissions.delete(proof);
    return result ?? null;
  }

  consumeEvidence(origin: object, proof: object): VerifiedExecutionEvidence | null {
    this.calls.push("evidence");
    const result = this.#evidence.get(proof);
    this.#evidence.delete(proof);
    return result?.origin === origin ? result.value : null;
  }
}
