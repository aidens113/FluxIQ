import { readFile } from "node:fs/promises";
import { AccountsTransportError } from "./transport-error.ts";

/** The current token: the first non-empty line of the token file (one or two tokens, one per line, the first is current). */
export async function readTokenFile(path: string): Promise<string> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch {
    throw new AccountsTransportError("the provisioning token file could not be read");
  }
  const first = text
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  if (first === undefined) throw new AccountsTransportError("the provisioning token file holds no token");
  return first;
}
