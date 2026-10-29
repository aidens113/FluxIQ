import { randomUUID } from "node:crypto";
import { PLATFORM_PROVISIONING_OPERATIONS } from "@fluxiq/contracts/platform";
import { AccountsTransportError } from "./transport-error.ts";
import { accountsUsage } from "./usage.ts";
import { buildAccountsInput } from "./build-accounts-input.ts";
import type { AccountsCommandIo, AccountsCommandTransport } from "./types.ts";

/**
 * `fluxiq accounts <operation> [flags]`. argv is `["accounts", <operation>, ...flags]`.
 * Prints the answer as one JSON line on stdout. Exit 0 ok, 1 a typed error or no
 * answer, 2 usage. A password is never echoed, and never taken from argv.
 */
export async function runAccountsCommand(argv: readonly string[], io: AccountsCommandIo, transport: AccountsCommandTransport): Promise<number> {
  const [head, operation, ...rest] = argv;
  if (head !== "accounts" || operation === undefined) {
    io.stderr(`${accountsUsage()}\n`);
    return 2;
  }
  if (operation === "help" || operation === "--help" || operation === "-h") {
    io.stdout(`${accountsUsage()}\n`);
    return 0;
  }
  if (!Object.hasOwn(PLATFORM_PROVISIONING_OPERATIONS, operation)) {
    io.stderr(`unknown operation "${operation}"\n\n${accountsUsage()}\n`);
    return 2;
  }
  const built = await buildAccountsInput(operation, rest, io, randomUUID);
  if (!built.ok) {
    io.stderr(`${built.message}\n`);
    return 2;
  }
  try {
    const answer = await transport.run(operation, built.input);
    io.stdout(`${JSON.stringify(answer)}\n`);
    return answer.ok ? 0 : 1;
  } catch (error) {
    io.stderr(`${error instanceof AccountsTransportError ? error.message : "the provisioning call failed unexpectedly"}\n`);
    return 1;
  }
}
