// The one way the converters refuse: an SdkError naming where in the type and what to write.

import { SdkError } from "../errors/index.ts";

/** Throws `invalid_schema` for the part of a type at `path` (a JSON Pointer), saying what to write instead. */
export function unsupportedType(path: string, message: string, hint?: string): never {
  const where = path === "" ? "the type" : `the type at ${path}`;
  const issues = [{ path, code: "sdk.unsupported_type", message }];
  throw new SdkError("invalid_schema", `${where}: ${message}${hint === undefined ? "" : ` ${hint}`}`, hint === undefined ? { issues } : { issues, hint });
}
