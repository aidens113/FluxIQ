import path from "node:path";
import type { AutomationStudioLlmStepLogWriter } from "./contract.ts";
import { automationStudioLlmStepLogScreen } from "../screen.ts";
import { NativeExchangeLogInvocation } from "../native/index.ts";

/** One writer's existing redaction state; every observed call supplies its own native invocation. */
export class NativeExchangeLogWriter {
  #redacted = false;
  readonly writer: AutomationStudioLlmStepLogWriter;

  constructor(private readonly folder: string) {
    this.writer = {
      folder,
      text: (name, content) => this.#text(name, content, undefined),
      json: (name, value) => this.#json(name, value, undefined),
      meta: record => this.#meta(record, undefined)
    };
  }

  text(name: string, content: string | Uint8Array, invocation?: NativeExchangeLogInvocation): void {
    this.#text(name, content, invocation);
  }

  json(name: string, value: unknown, invocation?: NativeExchangeLogInvocation): void {
    this.#json(name, value, invocation);
  }

  meta(record: Record<string, unknown>, invocation?: NativeExchangeLogInvocation): void {
    this.#meta(record, invocation);
  }

  #text(name: string, content: string | Uint8Array, invocation: NativeExchangeLogInvocation | undefined): void {
    if (invocation !== undefined) NativeExchangeLogInvocation.assert(invocation);
    try {
      const text = typeof content === "string" ? content : new TextDecoder("utf-8").decode(content);
      const screened = automationStudioLlmStepLogScreen(text);
      if (screened.redacted) this.#redacted = true;
      NativeExchangeLogInvocation.write(invocation, path.join(this.folder, name), screened.redacted ? screened.text : content);
    } catch (error) {
      NativeExchangeLogInvocation.failed(invocation, error);
      /* best-effort: a step file never fails the call it records */
    }
  }

  #json(name: string, value: unknown, invocation: NativeExchangeLogInvocation | undefined): void {
    if (invocation !== undefined) NativeExchangeLogInvocation.assert(invocation);
    let text: string | undefined;
    try {
      text = JSON.stringify(value, null, 2);
    } catch (error) {
      NativeExchangeLogInvocation.failed(invocation, error);
      try {
        text = JSON.stringify({ unserializable: error instanceof Error ? error.name : "non_error" });
      } catch (fallback) {
        NativeExchangeLogInvocation.failed(invocation, fallback);
        throw fallback;
      }
    }
    this.#text(name, `${text ?? "null"}\n`, invocation);
  }

  #meta(record: Record<string, unknown>, invocation: NativeExchangeLogInvocation | undefined): void {
    if (invocation !== undefined) NativeExchangeLogInvocation.assert(invocation);
    try {
      // Screened first, so a credential in a meta field is counted too.
      const text = JSON.stringify(record, null, 2);
      const screened = automationStudioLlmStepLogScreen(text);
      this.#json("meta.json", { ...record, ...(this.#redacted || screened.redacted ? { redacted: true } : {}) }, invocation);
    } catch (error) {
      NativeExchangeLogInvocation.failed(invocation, error);
      throw error;
    }
  }
}
