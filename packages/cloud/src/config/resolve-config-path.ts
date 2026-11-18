import path from "node:path";

/**
 * A config path made absolute, with forward slashes. A POSIX absolute path
 * (`/opt/fluxiq`, for a real server) and a Windows one (`C:/fluxiq`) are kept
 * as written whichever machine renders them, so rendering a server's config
 * on a laptop writes the server's paths; anything else is relative to the
 * config file's folder.
 */
export function resolveConfigPath(value: string, configDir: string): string {
  const slashed = value.replace(/\\/gu, "/");
  if (slashed.startsWith("/")) return path.posix.normalize(slashed);
  if (/^[A-Za-z]:\//u.test(slashed)) return path.win32.normalize(slashed).replace(/\\/gu, "/");
  return path.resolve(configDir, value).replace(/\\/gu, "/");
}
