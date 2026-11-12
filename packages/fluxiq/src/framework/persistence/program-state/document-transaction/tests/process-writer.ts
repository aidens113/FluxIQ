import readline from "node:readline";
import type { JsonObject } from "../../../../../core/index.ts";
import { programJsonDocumentTransaction } from "../transaction.ts";
import { ProgramJsonStore } from "../../storage.ts";

const [file, scope, mode, coordination] = process.argv.slice(2);
if (!file || !scope) throw new Error("A fixture document and scope are required.");
const input = readline.createInterface({ input: process.stdin });
const next = () => new Promise<string>((resolve) => input.once("line", resolve));
process.stdout.write("ready\n");
await next();
process.stdout.write("starting\n");
const write = async (document: Parameters<Parameters<typeof programJsonDocumentTransaction>[1]>[0]) => {
  const held = await document.read() ?? {};
  process.stdout.write("entered\n");
  if (mode === "hold") await next();
  const acts = held["actsByScope"] as JsonObject | undefined;
  const sources = held["pipelineSourcesByScope"] as JsonObject | undefined;
  process.stdout.write("writing\n");
  await document.write({ ...held, actsByScope: { ...acts, [scope]: { state: "landed" } }, pipelineSourcesByScope: { ...sources, [scope]: { snapshotId: `snapshot.${scope}`, count: 1 } } });
};
if (coordination === "unlocked") {
  // Isolated counterfactual: the old process-local read/replace, never a production bypass.
  const store = new ProgramJsonStore<JsonObject>(file, () => ({}));
  await write({ read: async () => await store.read(), write: async (value) => { await store.write(value); } });
} else await programJsonDocumentTransaction(file, write);
process.stdout.write("done\n");
input.close();
