import type { ExecutionCallbackOutcome, ExecutionCallbackSettlement } from "../../../../../../runtime/execution-observation/index.ts";
import type { AutomationStudioLlmEvidenceRuntimeBinding } from "../../../llm/harness-options/index.ts";

type Request = Parameters<AutomationStudioLlmEvidenceRuntimeBinding["executeTool"]>[0];
type Result = Awaited<ReturnType<AutomationStudioLlmEvidenceRuntimeBinding["executeTool"]>>;

/** This producer owns its actual completed returns, not a flag in a tool result. */
export class BuildToolTestHost implements AutomationStudioLlmEvidenceRuntimeBinding {
  readonly domainId = "example";
  readonly deniedEvidenceKeys = [];
  readonly tools = [];
  readonly runsNodes = {};
  #calls = 0;
  readonly #receipts = new WeakMap<object, Result>();
  readonly requests: Request[] = [];
  failure: Error | undefined;
  forged = false;
  beforeCall: (() => void) | undefined;

  get calls() { return this.#calls; }

  executeTool(input: Request): Promise<Result> {
    this.beforeCall?.();
    this.#calls += 1;
    this.requests.push(input);
    if (this.failure) throw this.failure;
    const result: Result = { kind: "llm_evidence_tool_execution", evidence: { ok: !this.forged, parameter: input.value.parameter ?? null }, effectApplied: !this.forged, ...(this.forged ? { resultCode: "synthetic.unacted" } : {}) };
    const returned = Promise.resolve(result);
    if (!this.forged) this.#receipts.set(returned, result);
    return returned;
  }

  completion(input: { outcome: ExecutionCallbackOutcome<Result>; returned?: Promise<Result> | undefined }): ExecutionCallbackSettlement | null {
    const actual = input.returned && this.#receipts.get(input.returned);
    if (actual && input.outcome.kind === "fulfilled" && actual === input.outcome.value) return { disposition: "settled", completionDigest: "test.actual.tool.return", assessmentDigest: "test.actual.tool.finished" };
    return null;
  }
}
