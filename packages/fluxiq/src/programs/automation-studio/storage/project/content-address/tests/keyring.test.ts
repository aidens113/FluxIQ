// @fluxiq-test-group real-sql
// The per-project content-address keyring (t745 design note D1, D3, D6): one
// random address key per project, sealed by the project's content protection,
// stored in content_address_keys, and used for HMAC-SHA256 addresses that never
// cross projects and never expose the key.
import { createHmac } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { inspect } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openAutomationStudioContentAddressKeyring, rotateAutomationStudioContentAddressKey } from "../index.ts";
import type { AutomationStudioContentAddressDomain } from "../index.ts";
import { hostProtection, keylessProtection, makeTempRoot, openTestProject, rawAddressKey, storedKeyRows } from "./keyring-fixture.ts";

let root: Awaited<ReturnType<typeof makeTempRoot>>;

beforeEach(async () => {
  root = await makeTempRoot();
});
afterEach(async () => root.remove());

function frame(fields: readonly Uint8Array[]): Buffer {
  return Buffer.concat(fields.flatMap((field) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(field.byteLength);
    return [length, Buffer.from(field)];
  }));
}

function expectedAddress(key: Buffer, domain: string, projectId: string, content: Buffer, context = ""): Buffer {
  const fields = ["fluxiq.content-address.v1", domain, projectId, context].map((value) => Buffer.from(value, "utf8"));
  return createHmac("sha256", key).update(frame([...fields, content])).digest();
}

describe("openAutomationStudioContentAddressKeyring", () => {
  it("creates exactly one sealed key for a fresh project and loads the same key on reopen", async () => {
    const protection = hostProtection();
    const project = await openTestProject(root.rootDir, "project.fresh");
    const first = await openAutomationStudioContentAddressKeyring({ database: project.database, projectId: "project.fresh", protection, now: () => 11 });
    const rows = await storedKeyRows(project.database);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ keyId: first.currentKeyId, createdAt: 11, retiredAt: null });
    expect(first.currentKeyId).toMatch(/^cak\.[0-9a-f]{16}$/u);
    expect(first.projectId).toBe("project.fresh");
    const content = Buffer.from("same bytes");
    const address = first.address("content-object", content);
    expect(address).toHaveLength(32);
    const key = await rawAddressKey({ protection, projectId: "project.fresh", row: rows[0]! });
    expect(address.equals(expectedAddress(key, "content-object", "project.fresh", content))).toBe(true);
    await project.close();

    const reopened = await openTestProject(root.rootDir, "project.fresh");
    const second = await openAutomationStudioContentAddressKeyring({ database: reopened.database, projectId: "project.fresh", protection });
    expect(second.currentKeyId).toBe(first.currentKeyId);
    expect(second.address("content-object", content).equals(address)).toBe(true);
    expect(await storedKeyRows(reopened.database)).toHaveLength(1);
    await reopened.close();
  });

  it("converges two concurrent opens on separate connections on one key", async () => {
    const protection = hostProtection();
    const left = await openTestProject(root.rootDir, "project.race");
    const right = await openTestProject(root.rootDir, "project.race");
    const sameConnection = Array.from({ length: 3 }, () => openAutomationStudioContentAddressKeyring({ database: left.database, projectId: "project.race", protection }));
    const otherConnection = Array.from({ length: 3 }, () => openAutomationStudioContentAddressKeyring({ database: right.database, projectId: "project.race", protection }));
    const keyrings = await Promise.all([...sameConnection, ...otherConnection]);
    expect(new Set(keyrings.map((keyring) => keyring.currentKeyId)).size).toBe(1);
    const addresses = new Set(keyrings.map((keyring) => keyring.address("gateway-trace-chunk", Buffer.from("chunk")).toString("hex")));
    expect(addresses.size).toBe(1);
    expect(await storedKeyRows(left.database)).toHaveLength(1);
    await left.close();
    await right.close();
  });

  it("gives the same content different addresses in two projects under the same host key", async () => {
    const protection = hostProtection();
    const alpha = await openTestProject(root.rootDir, "project.alpha");
    const beta = await openTestProject(root.rootDir, "project.beta");
    const alphaKeyring = await openAutomationStudioContentAddressKeyring({ database: alpha.database, projectId: "project.alpha", protection });
    const betaKeyring = await openAutomationStudioContentAddressKeyring({ database: beta.database, projectId: "project.beta", protection });
    const content = Buffer.from("the same page body");
    expect(alphaKeyring.address("content-object", content).equals(betaKeyring.address("content-object", content))).toBe(false);
    expect(alphaKeyring.currentKeyId).not.toBe(betaKeyring.currentKeyId);
    await alpha.close();
    await beta.close();
  });

  it("refuses a key row copied into another project's database, naming only the key id", async () => {
    const protection = hostProtection();
    const alpha = await openTestProject(root.rootDir, "project.alpha");
    const alphaKeyring = await openAutomationStudioContentAddressKeyring({ database: alpha.database, projectId: "project.alpha", protection });
    const [row] = await storedKeyRows(alpha.database);
    const key = await rawAddressKey({ protection, projectId: "project.alpha", row: row! });
    await alpha.close();

    const beta = await openTestProject(root.rootDir, "project.beta");
    await beta.database.run(
      "insert into content_address_keys (key_id, sealed, encryption, created_at_ms, retired_at_ms) values (?, ?, ?, ?, null)",
      [row!.keyId, row!.sealed, row!.encryption, row!.createdAt]
    );
    const failure = await openAutomationStudioContentAddressKeyring({ database: beta.database, projectId: "project.beta", protection }).then(
      () => new Error("the copied key row opened"),
      (error: unknown) => error as Error
    );
    expect(failure).toBeInstanceOf(Error);
    expect(failure.message).toBe(`Content address key ${alphaKeyring.currentKeyId} could not be opened.`);
    expect(failure.message).not.toContain(key.toString("hex"));
    expect(failure.cause).toBeUndefined();
    await beta.close();
  });

  it("fails closed without a host key or with the wrong host key", async () => {
    const project = await openTestProject(root.rootDir, "project.closed");
    await expect(openAutomationStudioContentAddressKeyring({ database: project.database, projectId: "project.closed", protection: keylessProtection() }))
      .rejects.toThrow("Protected project content key is unavailable.");
    expect(await storedKeyRows(project.database)).toHaveLength(0);

    const created = await openAutomationStudioContentAddressKeyring({ database: project.database, projectId: "project.closed", protection: hostProtection(7) });
    const expected = `Content address key ${created.currentKeyId} could not be opened.`;
    await expect(openAutomationStudioContentAddressKeyring({ database: project.database, projectId: "project.closed", protection: keylessProtection() })).rejects.toThrow(expected);
    await expect(openAutomationStudioContentAddressKeyring({ database: project.database, projectId: "project.closed", protection: hostProtection(8) })).rejects.toThrow(expected);
    await expect(openAutomationStudioContentAddressKeyring({ database: project.database, projectId: "project.closed", protection: hostProtection(7, "host.key.2") })).rejects.toThrow(expected);
    expect(await storedKeyRows(project.database)).toHaveLength(1);
    await project.close();
  });

  it("refuses a database that belongs to another project", async () => {
    const project = await openTestProject(root.rootDir, "project.owner");
    await expect(openAutomationStudioContentAddressKeyring({ database: project.database, projectId: "project.other", protection: hostProtection() }))
      .rejects.toThrow("does not belong to the project");
    await expect(rotateAutomationStudioContentAddressKey({ database: project.database, projectId: "project.other", protection: hostProtection() }))
      .rejects.toThrow("does not belong to the project");
    await project.close();
  });

  it("keeps the raw address key out of the database file", async () => {
    const protection = hostProtection();
    const project = await openTestProject(root.rootDir, "project.at-rest");
    await openAutomationStudioContentAddressKeyring({ database: project.database, projectId: "project.at-rest", protection });
    await rotateAutomationStudioContentAddressKey({ database: project.database, projectId: "project.at-rest", protection });
    const rows = await storedKeyRows(project.database);
    expect(rows).toHaveLength(2);
    const keys = await Promise.all(rows.map((row) => rawAddressKey({ protection, projectId: "project.at-rest", row })));
    await project.close();
    const projectDir = path.join(root.rootDir, "projects", "project.at-rest");
    const files = await readdir(projectDir);
    expect(files).toContain("project.sqlite");
    for (const file of files) {
      const bytes = await readFile(path.join(projectDir, file));
      for (const key of keys) {
        expect(bytes.includes(key)).toBe(false);
        expect(bytes.includes(Buffer.from(key.toString("hex")))).toBe(false);
        expect(bytes.includes(Buffer.from(key.toString("base64")))).toBe(false);
      }
    }
  });
});

describe("AutomationStudioContentAddressKeyring", () => {
  it("separates addresses by domain and by context, with unambiguous field boundaries", async () => {
    const project = await openTestProject(root.rootDir, "project.domains");
    const keyring = await openAutomationStudioContentAddressKeyring({ database: project.database, projectId: "project.domains", protection: hostProtection() });
    const content = Buffer.from("body");
    const domains: AutomationStudioContentAddressDomain[] = ["content-object", "gateway-trace-chunk", "gateway-trace-gear", "gateway-trace-artifact", "reusable-llm-context"];
    const byDomain = new Set(domains.map((domain) => keyring.address(domain, content).toString("hex")));
    expect(byDomain.size).toBe(domains.length);
    const plain = keyring.address("content-object", content).toString("hex");
    const empty = keyring.address("content-object", content, "").toString("hex");
    const contextA = keyring.address("content-object", content, "a").toString("hex");
    const contextB = keyring.address("content-object", content, "b").toString("hex");
    expect(empty).toBe(plain);
    expect(new Set([plain, contextA, contextB]).size).toBe(3);
    const shiftedLeft = keyring.address("content-object", Buffer.from("c"), "ab").toString("hex");
    const shiftedRight = keyring.address("content-object", Buffer.from("bc"), "a").toString("hex");
    expect(shiftedLeft).not.toBe(shiftedRight);
    expect(keyring.address("content-object", "body").toString("hex")).toBe(plain);
    expect(() => keyring.address("not-a-domain" as AutomationStudioContentAddressDomain, content)).toThrow("Content address domain is not one of the known domains.");
    await project.close();
  });

  it("keeps a retired key after rotation, so addresses under it can still be recomputed", async () => {
    const protection = hostProtection();
    const project = await openTestProject(root.rootDir, "project.rotate");
    const before = await openAutomationStudioContentAddressKeyring({ database: project.database, projectId: "project.rotate", protection });
    const content = Buffer.from("rotated content");
    const oldAddress = before.address("gateway-trace-artifact", content, "artifact");
    const rotated = await rotateAutomationStudioContentAddressKey({ database: project.database, projectId: "project.rotate", protection, now: () => 99 });
    expect(rotated.keyId).toMatch(/^cak\.[0-9a-f]{16}$/u);
    expect(rotated.keyId).not.toBe(before.currentKeyId);
    const rows = await storedKeyRows(project.database);
    expect(rows.find((row) => row.keyId === before.currentKeyId)).toMatchObject({ retiredAt: 99 });
    expect(rows.find((row) => row.keyId === rotated.keyId)).toMatchObject({ createdAt: 99, retiredAt: null });

    const after = await openAutomationStudioContentAddressKeyring({ database: project.database, projectId: "project.rotate", protection });
    expect(after.currentKeyId).toBe(rotated.keyId);
    expect(after.holds(before.currentKeyId)).toBe(true);
    expect(after.holds(rotated.keyId)).toBe(true);
    expect(after.addressWith(before.currentKeyId, "gateway-trace-artifact", content, "artifact").equals(oldAddress)).toBe(true);
    expect(after.address("gateway-trace-artifact", content, "artifact").equals(oldAddress)).toBe(false);
    expect(before.holds(rotated.keyId)).toBe(false);
    expect(() => before.addressWith(rotated.keyId, "gateway-trace-artifact", content)).toThrow(`Content address key ${rotated.keyId} is not held by this keyring.`);
    await project.close();
  });

  it("opens without a retired key that no longer opens, and refuses only addresses under it", async () => {
    const protection = hostProtection();
    const project = await openTestProject(root.rootDir, "project.retired-gone");
    const before = await openAutomationStudioContentAddressKeyring({ database: project.database, projectId: "project.retired-gone", protection });
    await rotateAutomationStudioContentAddressKey({ database: project.database, projectId: "project.retired-gone", protection });
    await project.database.run("update content_address_keys set sealed = zeroblob(32) where key_id = ?", [before.currentKeyId]);
    const after = await openAutomationStudioContentAddressKeyring({ database: project.database, projectId: "project.retired-gone", protection });
    expect(after.holds(before.currentKeyId)).toBe(false);
    expect(after.unavailableKeyIds).toEqual([before.currentKeyId]);
    expect(after.address("content-object", Buffer.from("still addressable")).byteLength).toBe(32);
    expect(() => after.addressWith(before.currentKeyId, "content-object", Buffer.from("x"))).toThrow(`Content address key ${before.currentKeyId} is unavailable: its sealed row did not open.`);
    await project.database.run("update content_address_keys set sealed = zeroblob(32) where key_id = ?", [after.currentKeyId]);
    await expect(openAutomationStudioContentAddressKeyring({ database: project.database, projectId: "project.retired-gone", protection })).rejects.toThrow(`Content address key ${after.currentKeyId} could not be opened.`);
    await project.close();
  });

  it("redacts its key bytes from JSON, inspection and errors", async () => {
    const protection = hostProtection();
    const project = await openTestProject(root.rootDir, "project.redact");
    const keyring = await openAutomationStudioContentAddressKeyring({ database: project.database, projectId: "project.redact", protection });
    const [row] = await storedKeyRows(project.database);
    const key = await rawAddressKey({ protection, projectId: "project.redact", row: row! });
    const forms = [key.toString("hex"), key.toString("base64"), key.toString("base64url"), [...key].join(",")];
    const json = JSON.stringify(keyring);
    const inspected = inspect(keyring, { showHidden: true, depth: Infinity, getters: true });
    const nested = inspect({ keyring }, { showHidden: true, depth: Infinity });
    const failure = (() => {
      try {
        keyring.addressWith("cak.0000000000000000", "content-object", Buffer.from("secret content"));
        return "";
      } catch (error) {
        return String((error as Error).message);
      }
    })();
    for (const text of [json, inspected, nested, failure]) {
      for (const form of forms) expect(text).not.toContain(form);
      expect(text).not.toContain("secret content");
    }
    expect(JSON.parse(json)).toEqual({ projectId: "project.redact", currentKeyId: keyring.currentKeyId, keyIds: [keyring.currentKeyId], keys: "[redacted]" });
    expect(inspected).toContain(keyring.currentKeyId);
    expect(inspected).toContain("[redacted]");
    expect(Object.keys(keyring)).not.toContain("keys");
    await project.close();
  });
});

describe("AUTOMATION_STUDIO_CONTENT_ADDRESS_MIGRATION", () => {
  it("allows at most one current key and pairs each object address with its key id", async () => {
    const project = await openTestProject(root.rootDir, "project.schema");
    const insertKey = "insert into content_address_keys (key_id, sealed, encryption, created_at_ms, retired_at_ms) values (?, x'00', 'envelope', 1, ?)";
    await project.database.run(insertKey, ["cak.0000000000000001", null]);
    await expect(project.database.run(insertKey, ["cak.0000000000000002", null])).rejects.toThrow("UNIQUE");
    await project.database.run(insertKey, ["cak.0000000000000002", 5]);
    await expect(project.database.run(insertKey, ["cak.NOTHEX000000000", 5])).rejects.toThrow("CHECK");
    await expect(project.database.run("insert into content_address_keys (key_id, sealed, encryption, created_at_ms) values ('cak.0000000000000003', x'00', '', 1)")).rejects.toThrow("CHECK");

    const insertObject = "insert into objects (object_id, sha256, media_type, byte_count, relative_path, created_at_ms, content_address, content_address_key_id) values (?, ?, 'text/plain', 1, 'p', 1, ?, ?)";
    const objectRow = (objectId: string, contentAddress: string | null, keyId: string | null) => [objectId, `sha.${objectId}`, contentAddress, keyId];
    const address = "ab".repeat(32);
    await project.database.run(insertObject, objectRow("object.ok", address, "cak.0000000000000001"));
    await project.database.run(insertObject, objectRow("object.unaddressed", null, null));
    await expect(project.database.run(insertObject, objectRow("object.no-key", address, null))).rejects.toThrow("CHECK");
    await expect(project.database.run(insertObject, objectRow("object.no-address", null, "cak.0000000000000001"))).rejects.toThrow("CHECK");
    await expect(project.database.run(insertObject, objectRow("object.upper", "AB".repeat(32), "cak.0000000000000001"))).rejects.toThrow("CHECK");
    await expect(project.database.run(insertObject, objectRow("object.short", "ab", "cak.0000000000000001"))).rejects.toThrow("CHECK");
    const indexes = await project.database.all<{ name: string }>("select name from sqlite_master where type = 'index' and tbl_name in ('objects', 'content_address_keys') order by name");
    expect(indexes.map((index) => index.name)).toEqual(expect.arrayContaining(["content_address_keys_current_idx", "objects_content_address_idx", "objects_sealed_unaddressed_idx"]));
    await project.close();
  });
});
