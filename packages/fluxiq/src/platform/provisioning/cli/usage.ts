import { PLATFORM_PROVISIONING_OPERATIONS } from "@fluxiq/contracts/platform";

/** The help text: the operations and the flags that fill their inputs. */
export function accountsUsage(): string {
  const operations = Object.keys(PLATFORM_PROVISIONING_OPERATIONS).join(", ");
  return [
    "usage: fluxiq accounts <operation> [flags]",
    "",
    `operations: ${operations}`,
    "",
    "flags (they fill the operation's input):",
    "  --email <email>  --display-name <name>  --external-id <id>  --user-id <id>",
    "  --policy <name> (repeat for several)  --workspace new|<id>  --reason <text>",
    "  --scope <sessions|browsers|password|all>  --mode <scheduled|immediate>",
    "  --terms-version <v>  --continue-url <path>  --send-welcome  --request-id <id>",
    "  --json '<object>' | --json -   the whole input as JSON (flags override it)",
    "  --password-stdin | --password-file <path>   a password is never taken from argv",
    "  --offline   run in this process (server stopped); setPassword needs it",
    "",
    "environment: FLUXIQ_PROVISIONING_LISTEN (host:port) and FLUXIQ_PROVISIONING_TOKEN_FILE",
    "select the private listener; without both the command runs offline.",
    "",
    "A mutating operation gets a random --request-id unless you pass one.",
    "exit: 0 ok, 1 a typed error or no answer, 2 usage."
  ].join("\n");
}
