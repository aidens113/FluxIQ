import path from "node:path";
import { FileEmailSender, NoneEmailSender, type EmailSender } from "fluxiq/platform";

/**
 * Builds the email sender named by `FLUXIQ_EMAIL_SENDER`: `none` sends
 * nothing, `file` (the default) writes to `defaultDirectory`, and `file:<dir>`
 * writes to `<dir>`, absolute or resolved from `cwd`. Anything else throws.
 */
export function resolveEmailSender(value: string | undefined, defaultDirectory: string, cwd: string = process.cwd()): EmailSender {
  const setting = value?.trim() ?? "";
  if (setting === "none") return new NoneEmailSender();
  if (setting === "" || setting === "file") return new FileEmailSender({ directory: defaultDirectory });
  if (setting.startsWith("file:")) {
    const directory = setting.slice("file:".length).trim();
    if (directory === "") throw new Error("FLUXIQ_EMAIL_SENDER file: needs a directory (file:<dir>).");
    return new FileEmailSender({ directory: path.resolve(cwd, directory) });
  }
  throw new Error("FLUXIQ_EMAIL_SENDER must be none, file or file:<dir>.");
}
