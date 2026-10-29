/** Whether the command line asks to run in this process (`--offline`). */
export function accountsArgvOffline(argv: readonly string[]): boolean {
  return argv.includes("--offline");
}
