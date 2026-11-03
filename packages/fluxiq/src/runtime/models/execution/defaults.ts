import { ExecutionCallbackPolicies } from "../../execution-observation/index.ts";

/** Core owns these live clock/random/timer operations; supplied callbacks have separate identities. */
export class ModelExecutionDefaults {
  static now(): number {
    return Date.now();
  }

  static random(): number {
    return Math.random();
  }

  static wait(milliseconds: number, signal?: AbortSignal): Promise<void> {
    if (milliseconds <= 0 || signal?.aborted === true) return Promise.resolve();
    return new Promise<void>((resolve) => {
      const settle = () => {
        clearTimeout(timer);
        signal?.removeEventListener("abort", settle);
        resolve();
      };
      const timer = setTimeout(settle, milliseconds);
      signal?.addEventListener("abort", settle, { once: true });
    });
  }
}

ExecutionCallbackPolicies.rememberLexical(ModelExecutionDefaults.now, "pure");
ExecutionCallbackPolicies.rememberLexical(ModelExecutionDefaults.random, "pure");
ExecutionCallbackPolicies.rememberLexical(ModelExecutionDefaults.wait, "pure");
