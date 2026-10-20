// @fluxiq-test-group real-sql
// t745 u3a probe: in a protected store no plain SHA-256 of trace content is kept
// at rest. For a large event and an artifact, neither the raw 32 bytes nor the
// hex of the SHA-256 of the whole event, of any piece the public splitter would
// cut, of any piece the keyed splitter did cut, or of the artifact appears in any
// file under the project directory; the keyed cut lengths differ from the public
// ones; and the stored digests are exactly the keyring's addresses of the keyed
// pieces. The same scan over a plain store finds those digests, so it can see them.
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { ClientGatewayTraceEvent } from "../../../../../../client-gateway/trace/index.ts";
import { gatewayTraceKeyedGearTable } from "../keyed-digests.ts";
import { splitGatewayTraceContentDefined } from "../split-content-defined.ts";
import { EVENT_ROWS_SQL, hostProtection, projectFiles, projectKeyring, recordTrace, sha256, viewText } from "./keyed-trace-support.ts";
import type { KeyedEventRow } from "./keyed-trace-support.ts";
import { SqliteTraceFixture } from "./sqlite-trace-fixture.ts";

const TRACE = "trace-probe";

let fixture: SqliteTraceFixture | undefined;

afterEach(async () => {
  await fixture?.dispose();
  fixture = undefined;
});

function artifactBytes(): Uint8Array {
  const bytes = new Uint8Array(40_000);
  for (let index = 0; index < bytes.byteLength; index += 1) bytes[index] = (index * 131 + (index >> 7)) & 0xff;
  return bytes;
}

function largeEvent(events: readonly ClientGatewayTraceEvent[]): Buffer {
  const texts = events.map((event) => Buffer.from(JSON.stringify(event), "utf8"));
  const largest = texts.reduce((best, text) => (text.byteLength > best.byteLength ? text : best));
  expect(largest.byteLength).toBeGreaterThan(400_000);
  return largest;
}

/** The plain SHA-256 needles of an event body and an artifact, each as raw bytes and as lower hex. */
function needles(input: { event: Buffer; publicPieces: readonly Uint8Array[]; keyedPieces: readonly Uint8Array[]; artifact: Uint8Array }): Array<{ label: string; bytes: Buffer }> {
  const digests: Array<{ label: string; digest: Buffer }> = [
    { label: "whole event", digest: sha256(input.event) },
    { label: "artifact", digest: sha256(input.artifact) },
    ...input.publicPieces.map((piece, index) => ({ label: `public piece ${index}`, digest: sha256(piece) })),
    ...input.keyedPieces.map((piece, index) => ({ label: `keyed piece ${index}`, digest: sha256(piece) }))
  ];
  return digests.flatMap(({ label, digest }) => [
    { label: `${label} (raw)`, bytes: digest },
    { label: `${label} (hex)`, bytes: Buffer.from(digest.toString("hex"), "utf8") }
  ]);
}

function found(files: ReadonlyArray<{ name: string; bytes: Buffer }>, list: ReadonlyArray<{ label: string; bytes: Buffer }>): string[] {
  return list.flatMap((needle) => files.filter((file) => file.bytes.includes(needle.bytes)).map((file) => `${needle.label} in ${path.basename(file.name)}`));
}

describe("plain SHA-256 of trace content at rest", () => {
  it("is nowhere under a protected project's directory, and the keyed cut is its own", async () => {
    const key = hostProtection(7);
    fixture = await SqliteTraceFixture.create({ protection: key });
    const artifact = artifactBytes();
    const written = await recordTrace(fixture.store, TRACE, [viewText(8_000, "probe"), viewText(300, "probe-small")], [artifact]);
    const event = largeEvent(written);
    const keyring = await projectKeyring(fixture.databasePool, SqliteTraceFixture.projectId, key);
    const publicPieces = splitGatewayTraceContentDefined(event);
    const keyedPieces = splitGatewayTraceContentDefined(event, gatewayTraceKeyedGearTable(keyring, keyring.currentKeyId));
    expect(Buffer.concat(keyedPieces).equals(event)).toBe(true);
    expect(keyedPieces.length).toBeGreaterThan(20);
    expect(keyedPieces.map((piece) => piece.byteLength)).not.toEqual(publicPieces.map((piece) => piece.byteLength));

    // The stored list is the keyring's addresses of the keyed pieces, in order.
    const rows = await fixture.rows<KeyedEventRow>(EVENT_ROWS_SQL, [TRACE]);
    const stored = rows.map((row) => row.digests!).find((list) => list.byteLength === keyedPieces.length * 32);
    const expected = Buffer.concat(keyedPieces.map((piece) => keyring.addressWith(keyring.currentKeyId, "gateway-trace-chunk", piece)));
    expect(stored?.equals(expected)).toBe(true);
    const manifest = await fixture.store.readManifest(TRACE);
    expect(manifest?.artifacts.map((entry) => entry.sha256)).toEqual([sha256(artifact).toString("hex")]);

    await fixture.closeAll();
    const files = await projectFiles(fixture.projectDirectory);
    expect(files.some((file) => file.name.endsWith("project.sqlite"))).toBe(true);
    expect(found(files, needles({ event, publicPieces, keyedPieces, artifact }))).toEqual([]);
  });

  it("is found by the same scan in a plain store", async () => {
    fixture = await SqliteTraceFixture.create();
    const artifact = artifactBytes();
    const written = await recordTrace(fixture.store, TRACE, [viewText(8_000, "probe")], [artifact]);
    const event = largeEvent(written);
    await fixture.closeAll();
    const files = await projectFiles(fixture.projectDirectory);
    const hits = found(files, needles({ event, publicPieces: splitGatewayTraceContentDefined(event), keyedPieces: [], artifact }));
    expect(hits).toContain("public piece 0 (raw) in project.sqlite");
    expect(hits).toContain("artifact (hex) in project.sqlite");
  });
});
