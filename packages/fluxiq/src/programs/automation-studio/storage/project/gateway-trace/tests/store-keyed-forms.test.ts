// @fluxiq-test-group real-sql
// t745 u3a: both forms of every trace row. A store without protection writes
// rows exactly as before (no key ids, plain SHA-256 digests, plaintext manifest)
// and a protected store reads them; an artifact id is never rewritten with other
// bytes, compared in the stored row's own form, and a keyed row a store cannot
// compare refuses the rewrite; a protected store seals its manifests, and a
// sealed manifest read without the protection throws.
import { afterEach, describe, expect, it } from "vitest";
import { GATEWAY_TRACE_MANIFEST_MEDIA_TYPE } from "../index.ts";
import { splitGatewayTraceContentDefined } from "../split-content-defined.ts";
import { CHUNK_ROWS_SQL, EVENT_ROWS_SQL, digestsOf, eventTexts, hostProtection, projectKeyring, recordTrace, sha256, viewText } from "./keyed-trace-support.ts";
import type { KeyedChunkRow, KeyedEventRow } from "./keyed-trace-support.ts";
import { SqliteTraceFixture } from "./sqlite-trace-fixture.ts";

type ArtifactRow = { artifactId: string; sha256: string; keyId: string | null };
type ManifestRow = { json: string; encryption: string | null };

const ARTIFACT_ROWS_SQL = "select artifact_id as artifactId, sha256, digest_key_id as keyId from client_gateway_trace_artifacts where trace_id = ? order by rowid";
const MANIFEST_ROW_SQL = "select manifest_json as json, manifest_encryption as encryption from client_gateway_traces where trace_id = ?";

let fixture: SqliteTraceFixture | undefined;

afterEach(async () => {
  await fixture?.dispose();
  fixture = undefined;
});

const bytesOf = (text: string): Uint8Array => new Uint8Array(Buffer.from(text, "utf8"));

describe("old-form and keyed trace rows", () => {
  it("writes rows unchanged without protection, and a protected store reads them and rekeys them as it opens", async () => {
    fixture = await SqliteTraceFixture.create();
    const artifact = bytesOf(`artifact:${"y".repeat(3_000)}`);
    const written = await recordTrace(fixture.store, "trace-old", [viewText(4_000, "old"), `{"small":true}`], [artifact]);
    const manifest = await fixture.store.readManifest("trace-old");

    const events = await fixture.rows<KeyedEventRow>(EVENT_ROWS_SQL, ["trace-old"]);
    expect(events.map((row) => ({ keyId: row.keyId, inline: row.json !== null }))).toEqual([
      { keyId: null, inline: false },
      { keyId: null, inline: true },
      { keyId: null, inline: true }
    ]);
    const large = Buffer.from(JSON.stringify(written[0]), "utf8");
    const publicDigests = splitGatewayTraceContentDefined(large).map((piece) => sha256(piece).toString("hex"));
    expect(digestsOf(events[0]!.digests).map((digest) => digest.toString("hex"))).toEqual(publicDigests);
    const chunks = await fixture.rows<KeyedChunkRow>(CHUNK_ROWS_SQL);
    expect(chunks.every((row) => row.keyId === null && row.encryption === null)).toBe(true);
    const artifacts = await fixture.rows<ArtifactRow>(ARTIFACT_ROWS_SQL, ["trace-old"]);
    expect(artifacts.map((row) => ({ sha256: row.sha256, keyId: row.keyId }))).toEqual([{ sha256: sha256(artifact).toString("hex"), keyId: null }]);
    const [manifestRow] = await fixture.rows<ManifestRow>(MANIFEST_ROW_SQL, ["trace-old"]);
    expect(manifestRow!.encryption).toBeNull();
    expect(JSON.parse(manifestRow!.json)).toEqual(manifest);

    const key = hostProtection(7);
    const store = await fixture.reopen({ protection: key });
    expect(eventTexts(await store.readEventRange("trace-old", 1, 99))).toEqual(eventTexts(written));
    expect(await store.readManifest("trace-old")).toEqual(manifest);
    expect(await store.listManifests({})).toEqual([manifest]);
    expect(await store.listArtifacts("trace-old")).toEqual([{ id: artifacts[0]!.artifactId, sha256: sha256(artifact).toString("hex"), byteLength: artifact.byteLength }]);
    // The protected open rekeyed the old rows (gateway-trace-rekey): every event, now chunked, and every chunk is keyed.
    const keyring = await projectKeyring(fixture.databasePool, SqliteTraceFixture.projectId, key);
    expect(store.rekey?.events.converted).toBe(3);
    expect((await fixture.rows<KeyedEventRow>(EVENT_ROWS_SQL, ["trace-old"])).every((row) => row.keyId === keyring.currentKeyId && row.json === null)).toBe(true);
    expect((await fixture.rows<KeyedChunkRow>(CHUNK_ROWS_SQL)).every((row) => row.keyId === keyring.currentKeyId)).toBe(true);
    await recordTrace(store, "trace-new", [viewText(4_000, "old")]);
    expect((await fixture.rows<KeyedEventRow>(EVENT_ROWS_SQL, ["trace-new"])).every((row) => row.keyId === keyring.currentKeyId)).toBe(true);
  });

  it("refuses to rewrite an artifact id with other bytes in both forms, and a keyed row without the keyring", async () => {
    fixture = await SqliteTraceFixture.create();
    const first = bytesOf("first artifact bytes");
    const other = bytesOf("other artifact bytes");
    await fixture.store.writeArtifact("trace-art", "artifact-old", first);
    await fixture.store.writeArtifact("trace-art", "artifact-old", first);
    await expect(fixture.store.writeArtifact("trace-art", "artifact-old", other)).rejects.toThrow("artifact artifact-old of trace trace-art is already stored with different contents");

    const key = hostProtection(7);
    const store = await fixture.reopen({ protection: key });
    await store.writeArtifact("trace-art", "artifact-old", first);
    await expect(store.writeArtifact("trace-art", "artifact-old", other)).rejects.toThrow("is already stored with different contents");
    await store.writeArtifact("trace-art", "artifact-keyed", first);
    await store.writeArtifact("trace-art", "artifact-keyed", first);
    await expect(store.writeArtifact("trace-art", "artifact-keyed", other)).rejects.toThrow("artifact artifact-keyed of trace trace-art is already stored with different contents");

    const keyring = await projectKeyring(fixture.databasePool, SqliteTraceFixture.projectId, key);
    const rows = await fixture.rows<ArtifactRow>(ARTIFACT_ROWS_SQL, ["trace-art"]);
    // The protected open rekeyed artifact-old before the writes above, so both rows are keyed now.
    const keyed = keyring.addressWith(keyring.currentKeyId, "gateway-trace-artifact", first).toString("hex");
    expect(rows).toEqual([
      { artifactId: "artifact-old", sha256: keyed, keyId: keyring.currentKeyId },
      { artifactId: "artifact-keyed", sha256: keyed, keyId: keyring.currentKeyId }
    ]);
    // The wire digest stays the plain SHA-256 of the bytes read back.
    expect((await store.listArtifacts("trace-art")).map((entry) => entry.sha256)).toEqual([sha256(first).toString("hex"), sha256(first).toString("hex")]);

    const bare = await fixture.reopen();
    await expect(bare.writeArtifact("trace-art", "artifact-keyed", first)).rejects.toThrow(
      `artifact artifact-keyed of trace trace-art is keyed under ${keyring.currentKeyId} and cannot be compared without the project's content address keyring`
    );
    await expect(bare.writeArtifact("trace-art", "artifact-old", first)).rejects.toThrow(
      `artifact artifact-old of trace trace-art is keyed under ${keyring.currentKeyId} and cannot be compared without the project's content address keyring`
    );
  });

  it("seals manifests in a protected store, reads them back, and throws on a sealed manifest without the protection", async () => {
    const key = hostProtection(7);
    fixture = await SqliteTraceFixture.create({ protection: key });
    await recordTrace(fixture.store, "trace-manifest", [`{"small":true}`], [bytesOf("manifest artifact")]);
    const manifest = await fixture.store.readManifest("trace-manifest");
    expect(manifest?.traceId).toBe("trace-manifest");
    expect(manifest?.artifacts).toHaveLength(1);

    const [row] = await fixture.rows<ManifestRow>(MANIFEST_ROW_SQL, ["trace-manifest"]);
    expect(row!.json.startsWith("fluxiq-sealed:")).toBe(true);
    expect(() => JSON.parse(row!.json)).toThrow();
    expect(row!.json.includes(manifest!.artifacts[0]!.sha256)).toBe(false);
    expect(JSON.parse(row!.encryption!)).toMatchObject({ version: 1, keyId: "key.1" });
    expect(GATEWAY_TRACE_MANIFEST_MEDIA_TYPE).toBe("application/vnd.fluxiq.client-gateway-trace-manifest+json");

    const store = await fixture.reopen({ protection: key });
    expect(await store.readManifest("trace-manifest")).toEqual(manifest);
    expect(await store.listManifests({ episodeId: "run-trace-manifest" })).toEqual([manifest]);

    const bare = await fixture.reopen();
    const sealed = "manifest of trace trace-manifest is sealed and cannot be opened without the project's content protection";
    await expect(bare.readManifest("trace-manifest")).rejects.toThrow(sealed);
    await expect(bare.listManifests({})).rejects.toThrow(sealed);
    const wrong = await fixture.sql("update client_gateway_traces set manifest_encryption = null where trace_id = 'trace-manifest'").then(() => fixture!.reopen({ protection: key }));
    await expect(wrong.readManifest("trace-manifest")).rejects.toThrow("manifest of trace trace-manifest is sealed but its row keeps no envelope");

    // A store without protection writes plaintext and clears the envelope.
    const plain = await fixture.reopen();
    await plain.writeManifest(manifest!);
    const [rewritten] = await fixture.rows<ManifestRow>(MANIFEST_ROW_SQL, ["trace-manifest"]);
    expect(rewritten!.encryption).toBeNull();
    expect(JSON.parse(rewritten!.json)).toEqual(manifest);
  });

  it("refuses a sealed manifest copied onto another trace's row", async () => {
    const key = hostProtection(7);
    fixture = await SqliteTraceFixture.create({ protection: key });
    await recordTrace(fixture.store, "trace-a", [`{"a":true}`], []);
    await recordTrace(fixture.store, "trace-b", [`{"b":true}`], []);
    await fixture.sql(`update client_gateway_traces set
      manifest_json = (select manifest_json from client_gateway_traces where trace_id = 'trace-a'),
      manifest_encryption = (select manifest_encryption from client_gateway_traces where trace_id = 'trace-a')
      where trace_id = 'trace-b'`);
    const store = await fixture.reopen({ protection: key });
    expect((await store.readManifest("trace-a"))?.traceId).toBe("trace-a");
    await expect(store.readManifest("trace-b")).rejects.toThrow("manifest row of trace trace-b holds the manifest of another trace");
  });
});
