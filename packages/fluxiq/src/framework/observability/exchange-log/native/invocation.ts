import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { nativeExchangeLogFunctions as original } from "./functions.ts";

/** Per-call native facts only. This object issues no execution or completion authority. */
export class NativeExchangeLogInvocation {
  readonly #available = new Set<string>();
  readonly #failures: unknown[] = [];
  #acknowledged = 0;
  #disabled = false;
  #unsupported = false;

  constructor() {
    for (const [name, callback] of Object.entries(original.operations)) {
      const descriptor = Object.getOwnPropertyDescriptor(original.fs, name);
      if (descriptor && "value" in descriptor && descriptor.value === callback) this.#available.add(name);
    }
    const date = Object.getOwnPropertyDescriptor(globalThis, "Date");
    const now = typeof original.date === "function" ? Object.getOwnPropertyDescriptor(original.date, "now") : undefined;
    if (date && "value" in date && date.value === original.date && now && "value" in now && now.value === original.now && typeof original.now === "function") this.#available.add("now");
  }

  static state(value: NativeExchangeLogInvocation): "unused" | "disabled" | "acknowledged" | "failed" | "unsupported" {
    const invocation = this.#original(value);
    if (invocation.#unsupported) return "unsupported";
    if (invocation.#failures.length) return "failed";
    if (invocation.#disabled) return "disabled";
    return invocation.#acknowledged ? "acknowledged" : "unused";
  }

  /** Original errors for the owning caller's cleanup; never presentation diagnostics. */
  static failures(value: NativeExchangeLogInvocation): readonly unknown[] {
    return Object.freeze([...this.#original(value).#failures]);
  }

  static assert(value: NativeExchangeLogInvocation): void {
    this.#original(value);
  }

  static failed(value: NativeExchangeLogInvocation | undefined, error: unknown): void {
    if (value !== undefined) this.#original(value).#failed(error);
  }

  static directory(value: NativeExchangeLogInvocation, environment?: Readonly<Record<string, string | undefined>>): string | undefined {
    const invocation = this.#original(value);
    const current = Object.getOwnPropertyDescriptor(original.process, "env");
    if (!current || !("value" in current) || current.value !== original.environment || environment !== undefined && environment !== original.environment) return invocation.#unsupportedDirectory();
    if (original.environment === null || typeof original.environment !== "object") return invocation.#unsupportedDirectory();
    const descriptor = Object.getOwnPropertyDescriptor(original.environment, "FLUXIQ_LLM_STEP_LOG_DIR");
    if (descriptor && !("value" in descriptor)) return invocation.#unsupportedDirectory();
    const directory: unknown = descriptor?.value;
    if (directory !== undefined && typeof directory !== "string") return invocation.#unsupportedDirectory();
    if (!directory || !path.isAbsolute(directory)) {
      if (invocation.#acknowledged === 0 && invocation.#failures.length === 0) invocation.#disabled = true;
      else invocation.#unsupported = true;
      return undefined;
    }
    return path.normalize(directory);
  }

  static mkdir(value: NativeExchangeLogInvocation | undefined, directory: string, options?: { recursive: true }): void {
    if (value === undefined) {
      if (options === undefined) mkdirSync(directory);
      else mkdirSync(directory, options);
      return;
    }
    this.#original(value).#perform("mkdirSync", () => {
      if (options === undefined) original.operations.mkdirSync(directory);
      else original.operations.mkdirSync(directory, options);
    });
  }

  static readdir(value: NativeExchangeLogInvocation | undefined, directory: string): string[] {
    if (value === undefined) return readdirSync(directory);
    return this.#original(value).#perform("readdirSync", () => original.operations.readdirSync(directory));
  }

  static exists(value: NativeExchangeLogInvocation | undefined, file: string): boolean {
    if (value === undefined) return existsSync(file);
    return this.#original(value).#perform("existsSync", () => original.operations.existsSync(file));
  }

  static read(value: NativeExchangeLogInvocation | undefined, file: string): string {
    if (value === undefined) return readFileSync(file, "utf8");
    return this.#original(value).#perform("readFileSync", () => original.operations.readFileSync(file, "utf8"));
  }

  static write(value: NativeExchangeLogInvocation | undefined, file: string, content: string | Uint8Array): void {
    if (value === undefined) return writeFileSync(file, content);
    this.#original(value).#perform("writeFileSync", () => original.operations.writeFileSync(file, content));
  }

  static rename(value: NativeExchangeLogInvocation | undefined, from: string, to: string): void {
    if (value === undefined) return renameSync(from, to);
    this.#original(value).#perform("renameSync", () => original.operations.renameSync(from, to));
  }

  static now(value: NativeExchangeLogInvocation | undefined): number {
    if (value === undefined) return Date.now();
    return this.#original(value).#perform("now", () => {
      if (typeof original.now !== "function") throw new Error("exchange_log.native_clock_unavailable");
      const now: unknown = Reflect.apply(original.now, original.date, []);
      if (typeof now !== "number") throw new Error("exchange_log.native_clock_invalid");
      return now;
    });
  }

  static #original(value: NativeExchangeLogInvocation): NativeExchangeLogInvocation {
    if (value === null || typeof value !== "object" || !(#available in value) || Object.getPrototypeOf(value) !== NativeExchangeLogInvocation.prototype) throw new Error("exchange_log.foreign_native_invocation");
    return value;
  }

  #perform<T>(name: string, operation: () => T): T {
    if (this.#disabled || !this.#available.has(name)) {
      this.#unsupported = true;
      throw new Error("exchange_log.native_identity_unavailable");
    }
    try {
      const result = operation();
      this.#acknowledged += 1;
      return result;
    } catch (error) {
      this.#failed(error);
      throw error;
    }
  }

  #failed(error: unknown): void {
    if (!this.#failures.includes(error)) this.#failures.push(error);
  }

  #unsupportedDirectory(): undefined {
    this.#unsupported = true;
    return undefined;
  }
}
