import { writeFileSync } from "node:fs";
import path from "node:path";
import { automationStudioLlmStepLogScreen } from "./screen.ts";

/** Writes one step's files, screened, and its `meta.json` last. */
export type AutomationStudioLlmStepLogWriter = {
  readonly folder: string;
  /** A file as given: a string or the exact bytes, unless a credential shape had to be replaced. */
  text(name: string, content: string | Uint8Array): void;
  /** A value as indented JSON. */
  json(name: string, value: unknown): void;
  /**
   * `meta.json`, which says the folder is complete, so it is written after
   * every other file. Carries `redacted: true` when anything in the folder was
   * screened.
   */
  meta(record: Record<string, unknown>): void;
};

/**
 * The writer for one step folder. Every write is best-effort: a disk that
 * refuses a step file never changes or fails the call the step records.
 */
export function automationStudioLlmStepLogWriter(folder: string): AutomationStudioLlmStepLogWriter {
  let redacted = false;
  const put = (name: string, content: string | Uint8Array) => {
    try {
      const text = typeof content === "string" ? content : new TextDecoder("utf-8").decode(content);
      const screened = automationStudioLlmStepLogScreen(text);
      if (screened.redacted) redacted = true;
      writeFileSync(path.join(folder, name), screened.redacted ? screened.text : content);
    } catch {
      /* best-effort: a step file never fails the call it records */
    }
  };
  const json = (name: string, value: unknown) => {
    let text: string | undefined;
    try {
      text = JSON.stringify(value, null, 2);
    } catch (error) {
      text = JSON.stringify({ unserializable: error instanceof Error ? error.name : "non_error" });
    }
    put(name, `${text ?? "null"}\n`);
  };
  return {
    folder,
    text: put,
    json,
    meta: (record) => {
      // Screened first, so a credential in a meta field is counted too.
      const text = JSON.stringify(record, null, 2);
      const screened = automationStudioLlmStepLogScreen(text);
      json("meta.json", { ...record, ...(redacted || screened.redacted ? { redacted: true } : {}) });
    }
  };
}
