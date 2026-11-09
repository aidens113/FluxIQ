// What a command may touch: its output, its environment and its working directory.
// The bin passes the process's; tests pass their own.

export type CliIo = {
  out(text: string): void;
  err(text: string): void;
  env: NodeJS.ProcessEnv;
  cwd: string;
  /** For tests: the fetch the commands that call the API use. */
  fetch?: typeof fetch;
};
