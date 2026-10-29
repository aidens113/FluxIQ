import type { PlatformProvisioningResponse } from "@fluxiq/contracts/platform";

/** The operator command line's I/O, injected so it is testable and never touches a process global. */
export type AccountsCommandIo = {
  stdout(text: string): void;
  stderr(text: string): void;
  /** All of standard input, read once. */
  readStdin(): Promise<string>;
  readFile(path: string): Promise<string>;
  env: Readonly<Record<string, string | undefined>>;
};

/** How an operation reaches the provisioning service: in this process, or over the private listener. */
export type AccountsCommandTransport = {
  run(operation: string, input: unknown): Promise<PlatformProvisioningResponse<unknown>>;
};

/** What `buildAccountsInput` made of the flags: the operation's input, or a usage message. */
export type AccountsInputResult = { ok: true; input: Record<string, unknown> } | { ok: false; message: string };
