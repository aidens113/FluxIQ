import path from "node:path";
import { readFileSync } from "node:fs";
import { FileEmailSender, NoneEmailSender, ResendEmailSender, type EmailSender } from "fluxiq/platform";

/**
 * Builds the email sender named by `FLUXIQ_EMAIL_SENDER`: `none` sends
 * nothing, `file` (the default) writes to `defaultDirectory`, and `file:<dir>`
 * writes to `<dir>`, absolute or resolved from `cwd`. `resend` uses explicit
 * operator credentials and sender address; it never falls back to a file.
 */
export function resolveEmailSender(value: string | undefined, defaultDirectory: string, cwd: string = process.cwd(), env: Readonly<Record<string, string | undefined>> = process.env): EmailSender {
  const setting = value?.trim() ?? "";
  if (setting === "none") return new NoneEmailSender();
  if (setting === "resend") return new ResendEmailSender({ apiKey: emailApiKey(env, cwd), from: env.FLUXIQ_EMAIL_FROM ?? "" });
  if (setting === "" || setting === "file") return new FileEmailSender({ directory: defaultDirectory });
  if (setting.startsWith("file:")) {
    const directory = setting.slice("file:".length).trim();
    if (directory === "") throw new Error("FLUXIQ_EMAIL_SENDER file: needs a directory (file:<dir>).");
    return new FileEmailSender({ directory: path.resolve(cwd, directory) });
  }
  throw new Error("FLUXIQ_EMAIL_SENDER must be none, file or file:<dir>, or resend.");
}

function emailApiKey(env: Readonly<Record<string, string | undefined>>, cwd: string): string {
  const file = env.FLUXIQ_EMAIL_API_KEY_FILE?.trim();
  const direct = env.FLUXIQ_EMAIL_API_KEY?.trim();
  if (file && direct) throw new Error("Configure only one platform email API key source.");
  if (!file) return direct ?? "";
  try { return readFileSync(path.resolve(cwd, file), "utf8").trim(); }
  catch { throw new Error("Platform email API key file could not be read."); }
}
