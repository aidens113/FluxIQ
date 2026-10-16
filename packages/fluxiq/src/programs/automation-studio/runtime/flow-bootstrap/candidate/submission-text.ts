import type { JsonObject } from "../../../../../core/index.ts";
import { canonical } from "./canonical.ts";

/**
 * The submitted Flow as the script reader reads it, so a resubmission that
 * differs only in what the reader ignores is the same Flow: line endings, the
 * spaces around each line, blank lines and whole-line comments
 * (`../authoring/parse.ts`). A JSON plan is read as its canonical JSON. Nothing
 * else of the input counts -- a new `summary` changes no step -- and an input
 * with neither has no text and is never "the same".
 */
export function submissionText(result: JsonObject): string | undefined {
  if (typeof result.flow === "string") {
    const lines = result.flow.split(/\r\n|\r|\n/u).map((line) => line.trim()).filter((line) => line && !line.startsWith("#") && !line.startsWith("//"));
    return `flow\n${lines.join("\n")}`;
  }
  return result.plan !== undefined ? `plan\n${canonical(result.plan)}` : undefined;
}
