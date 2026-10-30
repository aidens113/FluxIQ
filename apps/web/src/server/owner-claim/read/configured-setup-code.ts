import { readFile } from "node:fs/promises";
import { SETUP_CODE_MINIMUM_LENGTH } from "../setup-code-minimum-length";

/**
 * The setup code in the operator's `FLUXIQ_SETUP_CODE_FILE`, trimmed. Throws
 * when the file cannot be read or holds fewer than 16 characters; the message
 * names the setting, never the file's content.
 */
export async function readConfiguredSetupCode(codeFile: string): Promise<string> {
  let text: string;
  try {
    text = await readFile(codeFile, "utf8");
  } catch (error) {
    throw new Error(`FLUXIQ_SETUP_CODE_FILE could not be read (${(error as NodeJS.ErrnoException).code ?? "unknown error"}).`);
  }
  const code = text.trim();
  if ([...code].length < SETUP_CODE_MINIMUM_LENGTH) throw new Error(`FLUXIQ_SETUP_CODE_FILE must hold a setup code of at least ${SETUP_CODE_MINIMUM_LENGTH} characters.`);
  return code;
}
