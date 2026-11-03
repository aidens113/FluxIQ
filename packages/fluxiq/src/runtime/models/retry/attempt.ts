import type { ModelProvider, ModelRequest } from "../contracts/index.ts";
import type { ModelExecutionOptions } from "../execution/index.ts";
import { AutomationStudioLlmProviderError, automationStudioLlmSignalTimedOut } from "../failures/index.ts";
import { prepareObservedExecutionCallback, type OwnedExecutionCallback } from "../../execution-observation/index.ts";

/** Retains the actual provider invocation when its caller stops waiting for it. */
export class ModelProviderAttempt<Request extends ModelRequest> {
  private owned: OwnedExecutionCallback<ModelProvider<Request>, [Request, { signal: AbortSignal }], Promise<unknown>> | undefined;
  private fenced = false;

  constructor(private readonly provider: ModelProvider<Request>, private readonly callback: ModelProvider<Request>["runTask"], private readonly request: Request, private readonly signal: AbortSignal | undefined, private readonly execution: ModelExecutionOptions | undefined) {}

  retryAllowed(): boolean {
    return !this.execution?.observation || this.owned?.completion() === "settled";
  }

  async run(): Promise<unknown> {
    const controller = new AbortController();
    const parentAbort = () => controller.abort(this.signal?.reason);
    if (this.signal?.aborted) parentAbort();
    else this.signal?.addEventListener("abort", parentAbort, { once: true });
    const timer = setTimeout(() => controller.abort(new DOMException("LLM provider call reached its deadline.", "TimeoutError")), this.request.timeoutMs);
    let rejectAbort: (() => void) | undefined;
    try {
      if (controller.signal.aborted) throw this.abortFailure();
      const rawExecution = { signal: controller.signal };
      let actual: Promise<unknown>;
      if (this.execution?.observation) {
        this.owned = await prepareObservedExecutionCallback(this.execution.observation, { receiver: this.provider, callback: this.callback, args: [this.request, rawExecution] }, controller.signal);
        this.owned.bindCarrier(rawExecution);
        actual = this.owned.invoke();
      } else actual = this.callback.call(this.provider, this.request, rawExecution);
      const aborted = new Promise<never>((_resolve, reject) => {
        rejectAbort = () => reject(this.abortFailure());
        if (controller.signal.aborted) rejectAbort();
        else controller.signal.addEventListener("abort", rejectAbort, { once: true });
      });
      const result = await Promise.race([actual, aborted]);
      await this.fenceUnfinished();
      return result;
    } catch (error) {
      try { await this.fenceUnfinished(); }
      catch (cleanup) { throw new AggregateError([error, cleanup], "model.execution.completion_cleanup_failed"); }
      throw error;
    } finally {
      clearTimeout(timer);
      this.signal?.removeEventListener("abort", parentAbort);
      if (rejectAbort) controller.signal.removeEventListener("abort", rejectAbort);
    }
  }

  private async fenceUnfinished(): Promise<void> {
    if (!this.execution?.observation || !this.owned || this.owned.completion() === "settled" || this.fenced) return;
    this.fenced = true;
    this.owned.unknown();
    await this.owned.flush();
  }

  private abortFailure(): AutomationStudioLlmProviderError {
    const timedOut = !this.signal?.aborted || automationStudioLlmSignalTimedOut(this.signal);
    return new AutomationStudioLlmProviderError(timedOut ? "llm.provider_timeout" : "llm.provider_aborted", "Provider request ended.", timedOut);
  }
}
