import type { PlatformProvisioningError } from "@fluxiq/contracts/platform";

/** The parts of a schema issue read here (a zod issue fits). */
export type SchemaIssue = {
  code: string;
  path: readonly (string | number)[];
  message: string;
  keys?: readonly string[];
};

type ProvisioningIssue = NonNullable<PlatformProvisioningError["issues"]>[number];

const MAX_ISSUES = 50;
const MAX_PATH = 200;
const MAX_MESSAGE = 300;

/** Codes whose stock message can quote the value that was sent; each gets a fixed message instead. */
const VALUE_QUOTING_CODES: Readonly<Record<string, string>> = Object.freeze({
  invalid_enum_value: "Not one of the allowed values.",
  invalid_literal: "Not the allowed value.",
  invalid_union_discriminator: "Not one of the allowed values."
});

function joinPath(path: readonly (string | number)[]): string {
  return path.map(String).join(".").slice(0, MAX_PATH);
}

/**
 * The `invalid_input` issues for schema refusals: where, and what kind of
 * refusal, never the value sent. An unknown field (a `password` sent over
 * HTTP among them) is named by its path, "Unknown field.". Codes whose
 * message could quote the value get a fixed message; the rest keep the
 * schema's own, which names types, limits and formats only.
 */
export function provisioningInputIssues(issues: readonly SchemaIssue[]): ProvisioningIssue[] {
  const result: ProvisioningIssue[] = [];
  for (const issue of issues) {
    if (issue.code === "unrecognized_keys") {
      for (const key of issue.keys ?? []) result.push({ path: joinPath([...issue.path, key]), message: "Unknown field." });
      continue;
    }
    const message = VALUE_QUOTING_CODES[issue.code] ?? issue.message;
    result.push({ path: joinPath(issue.path), message: message.slice(0, MAX_MESSAGE) });
  }
  return result.slice(0, MAX_ISSUES);
}
