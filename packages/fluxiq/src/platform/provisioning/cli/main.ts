import { mkdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { FluxIQ } from "../../../framework/index.ts";
import { SQLiteRepository } from "../../../programs/database-manager/index.ts";
import { BufferedIamAuditSink, IamAuditStore } from "../../iam/index.ts";
import { FileEmailSender, NoneEmailSender } from "../email/index.ts";
import { createPlatformServices } from "../service/index.ts";
import { accountsArgvOffline } from "./argv-offline.ts";
import { runAccountsCommand } from "./run-accounts-command.ts";
import { selectAccountsTransport } from "./select-accounts-transport.ts";

// The `fluxiq accounts ...` entry (not imported by the barrel). Run with
// `--data-root <dir>` or FLUXIQ_ROOT (default: the working directory). With
// FLUXIQ_PROVISIONING_LISTEN and FLUXIQ_PROVISIONING_TOKEN_FILE set it calls
// the running server's private listener; otherwise it opens the data itself.

const SINGLE_WORKSPACE_ID = process.env.FLUXIQ_WORKSPACE_ID?.trim() || "workspace-main";

function dataRoot(argv: readonly string[]): string {
  const at = argv.indexOf("--data-root");
  const flagged = at >= 0 ? argv[at + 1] : undefined;
  return path.resolve(flagged ?? process.env.FLUXIQ_ROOT?.trim() ?? process.cwd());
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk as Uint8Array));
  return Buffer.concat(chunks).toString("utf8");
}

async function main(argv: readonly string[]): Promise<number> {
  const rest = argv.filter((_, index, all) => all[index] !== "--data-root" && all[index - 1] !== "--data-root");
  let audit: BufferedIamAuditSink | null = null;
  let auditStore: IamAuditStore | null = null;
  const transport = selectAccountsTransport(process.env, {
    offline: accountsArgvOffline(rest),
    async createInProcess() {
      process.stderr.write("Offline mode opens the data files directly. Use it only while the server is stopped.\n");
      const fluxiq = FluxIQ.create({ rootDir: dataRoot(argv) });
      const layoutVersion = path.basename(fluxiq.paths.config) === "config.json" ? 2 : 1;
      const platformDir = path.join(fluxiq.paths.fluxiq, "platform");
      mkdirSync(platformDir, { recursive: true });
      auditStore = await IamAuditStore.open(path.join(platformDir, "iam-audit.sqlite"));
      audit = new BufferedIamAuditSink(auditStore, { onError: () => process.stderr.write("The IAM audit could not be written.\n") });
      const services = await createPlatformServices({
        repository: new SQLiteRepository({ rootDir: fluxiq.paths.databases, kind: "platform.store", layoutVersion }),
        iamRepository: new SQLiteRepository({ rootDir: fluxiq.paths.databases, kind: "platform.iam", layoutVersion }),
        identity: fluxiq.programs.identityAccess,
        email: process.env.FLUXIQ_EMAIL_SENDER?.trim() === "none" ? new NoneEmailSender() : new FileEmailSender({ directory: path.join(platformDir, "outbox") }),
        auditSink: audit,
        publicOrigin: process.env.FLUXIQ_PUBLIC_ORIGIN?.trim() || "http://127.0.0.1:3000",
        tenancy: { mode: "single", workspaceId: SINGLE_WORKSPACE_ID }
      });
      return services.provisioning;
    }
  });
  try {
    return await runAccountsCommand(
      rest,
      {
        stdout: (text) => void process.stdout.write(text),
        stderr: (text) => void process.stderr.write(text),
        readStdin,
        readFile: (file) => readFile(file, "utf8"),
        env: process.env
      },
      transport
    );
  } finally {
    const closing = audit as BufferedIamAuditSink | null;
    const store = auditStore as IamAuditStore | null;
    if (closing !== null) await closing.close();
    if (store !== null) await store.close();
  }
}

main(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    process.stderr.write(`the accounts command failed unexpectedly (${error instanceof Error ? error.name : "unknown error"})\n`);
    process.exitCode = 1;
  }
);
