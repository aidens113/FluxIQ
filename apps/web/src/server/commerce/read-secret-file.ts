import { readFile } from "node:fs/promises";

/** Reads one secret from its file, trimmed; the value is never logged or put in an error. */
export async function readSecretFile(file: string, name: string): Promise<string> {
  let value: string;
  try {
    value = (await readFile(file, "utf8")).trim();
  } catch {
    throw new Error(`commerce.configuration: the ${name} file could not be read.`);
  }
  if (value === "") throw new Error(`commerce.configuration: the ${name} file is empty.`);
  return value;
}
