// The `@fluxiq/contracts/fluxnode` entry as a whole: what it exports, what it keeps
// internal, and that the retired word never appears in the new contracts (plan, O1).
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import * as entry from "../../fluxnode.ts";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((item) => {
    const path = join(directory, item.name);
    if (item.isDirectory()) return item.name === "tests" ? [] : sourceFiles(path);
    return item.name.endsWith(".ts") ? [path] : [];
  });
}

describe("@fluxiq/contracts/fluxnode", () => {
  it("exports one name for each contract a lane builds on", () => {
    for (const name of [
      "parseJsonTypeSchema",
      "validateJsonValue",
      "jsonTypeSchemaSchema",
      "parseFlowPath",
      "fluxNodeNameToFlowPath",
      "FLUXNODE_FLOW_ROOT",
      "automaticFlowPath",
      "CALL_FLOW_NODE_TYPE",
      "fluxNodeSpecSchema",
      "parseFluxNodeSpec",
      "fluxNodeSpecHash",
      "canonicalFluxNodeSpec",
      "resolveFluxNodeOptions",
      "parseFluxNodeRunRequest",
      "parseFluxNodeRunResult",
      "parseFluxNodeRunEvent",
      "parseFluxNodeEventAnswer",
      "FLUXNODE_ERROR_CODES",
      "dataLineageSchema",
      "datasetRefSchema",
      "dataStepSchema",
      "parseDataPipeline",
      "FLUXNODE_API_PATHS",
      "formatFluxNodeEventFrame"
    ]) {
      expect(entry, name).toHaveProperty(name);
    }
  });

  it("keeps the zod bridge internal", () => {
    expect(entry).not.toHaveProperty("zodFromParser");
    expect(entry).not.toHaveProperty("parseWithZod");
  });

  it("never uses the retired word for a Flow that another Flow calls", () => {
    const offenders = sourceFiles(ROOT).filter((file) => /subflow/iu.test(readFileSync(file, "utf8")));
    expect(offenders).toEqual([]);
  });

  it("imports no Node built-in outside tests", () => {
    const offenders = sourceFiles(ROOT).filter((file) => /from\s+["']node:/u.test(readFileSync(file, "utf8")));
    expect(offenders).toEqual([]);
  });
});
