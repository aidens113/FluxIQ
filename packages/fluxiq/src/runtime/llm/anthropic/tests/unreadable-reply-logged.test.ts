// An answer Core cannot read is kept in the run's step log, so a person can see what the model sent.
// The credential check still comes first: a reply holding the key is never written.
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createAutomationStudioAnthropicProvider } from "../provider.ts";
import { decisionRequest, streamReply } from "./fixtures.ts";

const KEY = ["dummy", "provider", "key"].join("-");
const MARK = "the-words-the-model-really-sent";
let directory: string | undefined;

function provider(text: string) {
  return createAutomationStudioAnthropicProvider({ secretReference: { kind: "secret_reference", id: "secret:claude" }, resolveSecret: async () => KEY, fetchImpl: vi.fn(async () => streamReply(text, "end_turn")) as typeof fetch });
}

/** Every file the step log wrote, as one text. */
function logged(root: string): string {
  return readdirSync(root, { recursive: true, withFileTypes: true }).filter((entry) => entry.isFile()).map((entry) => readFileSync(path.join(entry.parentPath, entry.name), "utf8")).join("\n");
}

afterEach(() => {
  vi.unstubAllEnvs();
  if (directory) rmSync(directory, { recursive: true, force: true });
  directory = undefined;
});

describe("the step log of an unreadable reply", () => {
  function logging(): string {
    directory = mkdtempSync(path.join(tmpdir(), "fluxiq-unreadable-"));
    vi.stubEnv("FLUXIQ_LLM_STEP_LOG_DIR", directory);
    return directory;
  }

  it("holds what the model sent, and the failure it came to", async () => {
    const root = logging();
    const failure = await provider(JSON.stringify({ result_json: `not an answer: ${MARK}` })).runTask(decisionRequest()).then(() => undefined, (error: unknown) => error as { code: string });
    expect(failure?.code).toBe("llm.provider_malformed_response");
    expect(logged(root)).toContain(MARK);
  });

  it("holds nothing of a reply carrying the credential", async () => {
    const root = logging();
    const failure = await provider(JSON.stringify({ result_json: `not an answer: ${MARK} ${KEY}` })).runTask(decisionRequest()).then(() => undefined, (error: unknown) => error as { code: string });
    expect(failure?.code).toBe("llm.provider_output_invalid");
    expect(logged(root)).not.toContain(KEY);
    expect(logged(root)).not.toContain(MARK);
  });
});
