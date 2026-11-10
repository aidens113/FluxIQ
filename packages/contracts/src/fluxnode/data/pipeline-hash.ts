// A pipeline's hash (plan, D3): what registering a pipeline answers in place of a spec
// hash, so a registered pipeline runs by name and hash exactly as a FluxNode does.

import type { JsonObject } from "../../core.ts";
import { canonicalJson } from "../json/index.ts";
import type { DataPipeline } from "./pipeline.ts";

/**
 * SHA-256 of the pipeline's canonical JSON, as 64 lowercase hex characters. Every
 * part counts: a pipeline has no options apart from its steps. Uses
 * `globalThis.crypto.subtle`, present in browsers and Node 20+.
 */
export async function dataPipelineHash(pipeline: DataPipeline): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (subtle === undefined) throw new Error("A pipeline hash needs globalThis.crypto.subtle (a secure browser context or Node 20+).");
  const digest = await subtle.digest("SHA-256", new TextEncoder().encode(canonicalJson(pipeline as unknown as JsonObject)));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
