// Where a pipeline's records go (plan, D2): a dataset, a JSON or CSV file, a webhook,
// or a function in the developer's program reached over the event stream.

import { z } from "zod";
import { fluxNodeFieldSchemas } from "../fields/index.ts";

const RELATIVE_FILE = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9._\- /]{1,256}$/u;

/** The name a program registered a callback under: a letter or "_", then letters, digits, "_", "." and "-", at most 64. */
export const sdkCallbackNameSchema = z.string().regex(/^[A-Za-z_][A-Za-z0-9_.-]{0,63}$/u, 'A callback name such as "enrichListing": a letter or "_", then letters, digits, "_", "." and "-".');

/** Credentials written before the host, as in `https://name:secret@host/`. */
const CREDENTIALS = /^[A-Za-z][A-Za-z0-9+.-]*:\/\/[^/?#]*@/u;

function isWebhookAddress(value: string): boolean {
  if (!URL.canParse(value) || CREDENTIALS.test(value)) return false;
  const address = new URL(value);
  if (address.protocol === "https:") return true;
  return address.protocol === "http:" && (address.hostname === "localhost" || address.hostname === "127.0.0.1" || address.hostname === "[::1]");
}

/**
 * - `dataset`: a dataset of the run, by name;
 * - `file`: a JSON or CSV file at a relative path under the engine's export folder,
 *   never outside it;
 * - `webhook`: a POST to an https address (http only on this machine), with no
 *   credentials in the address;
 * - `sdk`: a callback the program registered.
 */
export const dataSinkSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("dataset"), name: fluxNodeFieldSchemas.shortText }).strict(),
  z.object({ kind: z.literal("file"), format: z.enum(["json", "csv"]), path: z.string().regex(RELATIVE_FILE, "A relative path with no \"..\", such as \"exports/listings.csv\".") }).strict(),
  z.object({ kind: z.literal("webhook"), url: z.string().max(2048).refine(isWebhookAddress, "An https address with no credentials in it (http only for localhost).") }).strict(),
  z.object({ kind: z.literal("sdk"), callback: sdkCallbackNameSchema }).strict()
]);

export type DataSink = z.infer<typeof dataSinkSchema>;
