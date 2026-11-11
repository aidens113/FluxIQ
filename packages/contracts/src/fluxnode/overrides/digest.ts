// The digest of resolved overrides: SHA-256 hex of their canonical JSON. Equal overrides
// give equal digests whatever order their keys were written in.

import type { JsonValue } from "../../core.ts";
import { canonicalJson } from "../json/index.ts";
import type { FluxNodeResolvedOverrides } from "./resolved.ts";
import { sha256Hex } from "./sha256-hex.ts";

export async function fluxNodeOverridesDigest(overrides: FluxNodeResolvedOverrides): Promise<string> {
  return sha256Hex(canonicalJson(JSON.parse(JSON.stringify(overrides)) as JsonValue));
}
