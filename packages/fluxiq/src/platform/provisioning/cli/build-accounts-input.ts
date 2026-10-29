import { PLATFORM_PROVISIONING_OPERATIONS } from "@fluxiq/contracts/platform";
import { ACCOUNTS_SWITCH_FLAGS, ACCOUNTS_VALUE_FLAGS } from "./flag-fields.ts";
import { stripTrailingNewline } from "./strip-trailing-newline.ts";
import type { AccountsCommandIo, AccountsInputResult } from "./types.ts";

const WORKSPACE_ID_OPERATIONS: ReadonlySet<string> = new Set(["setPolicies", "addMember"]);

type ParsedFlags = { values: Map<string, string[]>; switches: Set<string> };

/** Splits `--flag value`, `--flag=value` and switches; a message when a flag is unknown or lacks its value. */
function splitFlags(args: readonly string[]): ParsedFlags | string {
  const values = new Map<string, string[]>();
  const switches = new Set<string>();
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index] ?? "";
    if (arg === "--password" || arg.startsWith("--password=")) return "a password is never taken from the command line; use --password-stdin or --password-file <path>";
    if (!arg.startsWith("--")) return `unexpected argument "${arg}"`;
    const eq = arg.indexOf("=");
    const name = eq === -1 ? arg.slice(2) : arg.slice(2, eq);
    if (Object.hasOwn(ACCOUNTS_SWITCH_FLAGS, name)) {
      if (eq !== -1) return `--${name} takes no value`;
      switches.add(name);
    } else if (Object.hasOwn(ACCOUNTS_VALUE_FLAGS, name)) {
      let value: string | undefined;
      if (eq !== -1) value = arg.slice(eq + 1);
      else {
        const next = args[index + 1];
        if (next !== undefined && !(next.startsWith("--") && next.length > 2)) {
          value = next;
          index += 1;
        }
      }
      if (value === undefined) return `--${name} needs a value`;
      values.set(name, [...(values.get(name) ?? []), value]);
    } else return `unknown flag --${name}`;
  }
  return { values, switches };
}

/** Reads `--json` (inline, or `-` for stdin); a password inside inline JSON is refused because argv is visible to other processes. */
async function readJsonInput(source: string, io: AccountsCommandIo): Promise<Record<string, unknown> | string> {
  const text = source === "-" ? await io.readStdin() : source;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return "--json is not valid JSON";
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return "--json must be a JSON object";
  if (source !== "-" && Object.hasOwn(parsed, "password")) return "a password is never taken from the command line; pass it with --json - on stdin, --password-stdin or --password-file <path>";
  return { ...(parsed as Record<string, unknown>) };
}

/**
 * Builds an operation's input from its flags and/or `--json`. Flags override
 * `--json`. A mutating operation without a request id gets one from
 * `newRequestId` (`getAccount` gets none). The password comes only from stdin
 * or a file.
 */
export async function buildAccountsInput(operation: string, args: readonly string[], io: AccountsCommandIo, newRequestId: () => string): Promise<AccountsInputResult> {
  if (!Object.hasOwn(PLATFORM_PROVISIONING_OPERATIONS, operation)) return { ok: false, message: `unknown operation "${operation}"` };
  const flags = splitFlags(args);
  if (typeof flags === "string") return { ok: false, message: flags };
  const { values, switches } = flags;

  const jsonSource = values.get("json");
  if ((jsonSource?.length ?? 0) > 1) return { ok: false, message: "--json may be given once" };
  const stdinUses = (jsonSource?.[0] === "-" ? 1 : 0) + (switches.has("password-stdin") ? 1 : 0);
  if (stdinUses > 1) return { ok: false, message: "--json - and --password-stdin both read stdin; use --password-file for the password" };
  if (switches.has("password-stdin") && values.has("password-file")) return { ok: false, message: "use one of --password-stdin and --password-file" };

  let input: Record<string, unknown> = {};
  if (jsonSource !== undefined) {
    const fromJson = await readJsonInput(jsonSource[0] ?? "", io);
    if (typeof fromJson === "string") return { ok: false, message: fromJson };
    input = fromJson;
  }

  for (const [name, list] of values) {
    const field = ACCOUNTS_VALUE_FLAGS[name] ?? "";
    if (field.startsWith("$")) continue;
    if (field === "policies") {
      input.policies = list;
      continue;
    }
    if (list.length > 1) return { ok: false, message: `--${name} may be given once` };
    const target = field === "workspace" && WORKSPACE_ID_OPERATIONS.has(operation) ? "workspaceId" : field;
    input[target] = list[0];
  }
  for (const name of switches) {
    const field = ACCOUNTS_SWITCH_FLAGS[name] ?? "";
    if (!field.startsWith("$")) input[field] = true;
  }

  if (switches.has("password-stdin")) input.password = stripTrailingNewline(await io.readStdin());
  const passwordFile = values.get("password-file");
  if (passwordFile !== undefined) {
    if (passwordFile.length > 1) return { ok: false, message: "--password-file may be given once" };
    try {
      input.password = stripTrailingNewline(await io.readFile(passwordFile[0] ?? ""));
    } catch {
      return { ok: false, message: "the --password-file could not be read" };
    }
  }

  if (operation !== "getAccount" && input.requestId === undefined) input.requestId = newRequestId();
  return { ok: true, input };
}
