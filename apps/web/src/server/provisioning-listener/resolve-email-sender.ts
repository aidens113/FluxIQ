import path from "node:path";
import { readFileSync } from "node:fs";
import { FileEmailSender, NoneEmailSender, ResendEmailSender, SmtpEmailSender, parseSmtpEndpoint, type EmailSender, type SmtpEmailOptions } from "fluxiq/platform";

type Env = Readonly<Record<string, string | undefined>>;

const SMTP_SCHEME = /^(?:smtp|smtps|smtp\+starttls):\/\//u;

/**
 * Builds the email sender named by `FLUXIQ_EMAIL_SENDER`: `none` sends
 * nothing, `file` (the default) writes to `defaultDirectory`, and `file:<dir>`
 * writes to `<dir>`, absolute or resolved from `cwd`. `resend` uses explicit
 * operator credentials and sender address; it never falls back to a file.
 * `smtp://host:port` (a mail sink or relay on a private network),
 * `smtp+starttls://host:port` or `smtps://host:port` deliver over SMTP from
 * `FLUXIQ_EMAIL_FROM`; a relay that needs a sign-in takes
 * `FLUXIQ_EMAIL_SMTP_USERNAME` and the file `FLUXIQ_EMAIL_SMTP_PASSWORD_FILE`
 * (never sent over plain `smtp://`), and a private relay's certificate
 * authority may be named by `FLUXIQ_EMAIL_SMTP_CA_FILE`.
 */
export function resolveEmailSender(value: string | undefined, defaultDirectory: string, cwd: string = process.cwd(), env: Env = process.env): EmailSender {
  const setting = value?.trim() ?? "";
  if (setting === "none") return new NoneEmailSender();
  if (setting === "resend") return new ResendEmailSender({ apiKey: emailApiKey(env, cwd), from: env.FLUXIQ_EMAIL_FROM ?? "" });
  if (SMTP_SCHEME.test(setting)) return new SmtpEmailSender(smtpOptions(setting, env, cwd));
  if (setting === "" || setting === "file") return new FileEmailSender({ directory: defaultDirectory });
  if (setting.startsWith("file:")) {
    const directory = setting.slice("file:".length).trim();
    if (directory === "") throw new Error("FLUXIQ_EMAIL_SENDER file: needs a directory (file:<dir>).");
    return new FileEmailSender({ directory: path.resolve(cwd, directory) });
  }
  throw new Error("FLUXIQ_EMAIL_SENDER must be none, file or file:<dir>, resend, or smtp://host:port (also smtp+starttls:// and smtps://).");
}

function emailApiKey(env: Env, cwd: string): string {
  const file = env.FLUXIQ_EMAIL_API_KEY_FILE?.trim();
  const direct = env.FLUXIQ_EMAIL_API_KEY?.trim();
  if (file && direct) throw new Error("Configure only one platform email API key source.");
  if (!file) return direct ?? "";
  try { return readFileSync(path.resolve(cwd, file), "utf8").trim(); }
  catch { throw new Error("Platform email API key file could not be read."); }
}

function smtpOptions(setting: string, env: Env, cwd: string): SmtpEmailOptions {
  const options: SmtpEmailOptions = { endpoint: parseSmtpEndpoint(setting), from: env.FLUXIQ_EMAIL_FROM ?? "" };
  const username = env.FLUXIQ_EMAIL_SMTP_USERNAME?.trim() ?? "";
  const secretFile = env.FLUXIQ_EMAIL_SMTP_PASSWORD_FILE?.trim() ?? "";
  if ((username === "") !== (secretFile === "")) throw new Error("An SMTP sign-in needs both FLUXIQ_EMAIL_SMTP_USERNAME and FLUXIQ_EMAIL_SMTP_PASSWORD_FILE.");
  if (username !== "") options.auth = { username, secret: readSecretFile(secretFile, cwd, "SMTP password file") };
  const authorityFile = env.FLUXIQ_EMAIL_SMTP_CA_FILE?.trim() ?? "";
  if (authorityFile !== "") options.trustedCertificates = readSecretFile(authorityFile, cwd, "SMTP certificate authority file");
  return options;
}

function readSecretFile(file: string, cwd: string, what: string): string {
  try { return readFileSync(path.resolve(cwd, file), "utf8").trim(); }
  catch { throw new Error(`The ${what} could not be read.`); }
}
