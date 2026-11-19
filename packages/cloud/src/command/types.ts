/** One command to run: its arguments, folder, standard input, and whether its output is shown as it runs. */
export type CommandRequest = {
  args: readonly string[];
  cwd?: string;
  input?: string;
  /** Show the command's output live (builds, compose up); it is still collected. */
  echo?: boolean;
  /** Variables added to the program's environment (Compose interpolation values); never a secret. */
  env?: Readonly<Record<string, string>>;
};

/** What a command answered. A program that could not be started answers code 127. */
export type CommandResult = {
  code: number;
  stdout: string;
  stderr: string;
};

/** Runs external programs (`docker`, `certutil`). Injected, so everything above it is testable without Docker. */
export type CommandRunner = {
  run(command: string, request: CommandRequest): Promise<CommandResult>;
};
