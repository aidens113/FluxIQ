// Test support for the trace rekey (t745 u3b): the checks that a project's
// traces are wholly in the keyed forms under one key, the rows that say so, and
// a scan of every file under the project directory for needles.
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { expect } from "vitest";
import type { MigratedProject } from "./migrated-project.ts";

type Count = { n: number };

/** Every event chunked under `keyId`, every chunk and use under it and sealed, every artifact keyed and sealed, every manifest sealed. */
export async function expectKeyedEndState(project: MigratedProject, keyId: string): Promise<void> {
  const count = async (statement: string, params: readonly unknown[] = [keyId]): Promise<number> => (await project.rows<Count>(statement, params))[0]!.n;
  expect(await count("select count(*) as n from client_gateway_trace_events", [])).toBeGreaterThan(0);
  expect(await count(`select count(*) as n from client_gateway_trace_events
    where event_chunk_address_key_id is not ? or event_json is not null or event_object_id is not null`)).toBe(0);
  expect(await count("select count(*) as n from client_gateway_trace_chunks where address_key_id is not ? or encryption is null")).toBe(0);
  expect(await count(`select count(*) as n from client_gateway_trace_chunk_uses u left join client_gateway_trace_chunks c on c.digest = u.digest
    where c.digest is null or c.address_key_id is not ?`)).toBe(0);
  expect(await count(`select count(*) as n from client_gateway_trace_artifacts a left join objects o on o.object_id = a.object_id
    where a.digest_key_id is not ? or o.object_id is null or o.encryption is null`)).toBe(0);
  expect(await count("select count(*) as n from client_gateway_traces where manifest_encryption is null", [])).toBe(0);
  expect(await count("select count(*) as n from object_references where purpose = 'event'", [])).toBe(0);
  expect(await count("select count(*) as n from objects where encryption is null", [])).toBe(0);
}

/** The project's objects (id and file), to check later that they are gone. */
export function objectRows(project: MigratedProject): Promise<Array<{ object_id: string; relative_path: string }>> {
  return project.rows("select object_id, relative_path from objects order by object_id");
}

export async function fileExists(file: string): Promise<boolean> {
  try {
    await stat(file);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

/** Every file under the directory. */
export async function filesUnder(directory: string): Promise<Array<{ name: string; bytes: Buffer }>> {
  const files: Array<{ name: string; bytes: Buffer }> = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const name = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await filesUnder(name)));
    if (entry.isFile()) files.push({ name, bytes: await readFile(name) });
  }
  return files;
}

/** Which needles appear in which files. */
export function needlesFound(files: ReadonlyArray<{ name: string; bytes: Buffer }>, needles: ReadonlyArray<{ label: string; bytes: Buffer }>): string[] {
  return needles.flatMap((needle) => files.filter((file) => file.bytes.includes(needle.bytes)).map((file) => `${needle.label} in ${path.basename(file.name)}`));
}

/** The rows that name each event's, chunk's and artifact's form, to compare two states. */
export async function formRows(project: MigratedProject): Promise<unknown[]> {
  return [
    await project.rows("select trace_id, sequence, hex(event_chunk_digests) as d, event_chunk_address_key_id as k from client_gateway_trace_events order by trace_id, sequence"),
    await project.rows("select hex(digest) as d, address_key_id as k from client_gateway_trace_chunks order by digest"),
    await project.rows("select trace_id, hex(digest) as d from client_gateway_trace_chunk_uses order by trace_id, digest"),
    await project.rows("select trace_id, artifact_id, object_id, sha256, digest_key_id from client_gateway_trace_artifacts order by trace_id, artifact_id"),
    await project.rows("select trace_id, manifest_encryption is not null as sealed from client_gateway_traces order by trace_id")
  ];
}
