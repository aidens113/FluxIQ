import { generateKeyPairSync, randomBytes, sign } from "node:crypto";

/**
 * A self-signed P-256 certificate for 127.0.0.1 and `localhost`, built in
 * memory for the SMTP tests' TLS server, so no key or certificate is ever
 * committed and no `openssl` is needed. Valid from an hour ago for a day.
 */
export function selfSignedCertificate(): { key: string; cert: string } {
  const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const algorithm = sequence(objectId("1.2.840.10045.4.3.2"));
  const name = sequence(set(sequence(objectId("2.5.4.3"), tagged(0x0c, Buffer.from("localhost")))));
  const now = Date.now();
  const validity = sequence(utcTime(new Date(now - 3_600_000)), utcTime(new Date(now + 86_400_000)));
  const altNames = sequence(tagged(0x82, Buffer.from("localhost")), tagged(0x87, Buffer.from([127, 0, 0, 1])));
  const extensions = tagged(0xa3, sequence(sequence(objectId("2.5.29.17"), tagged(0x04, altNames))));
  const serial = Buffer.concat([Buffer.from([1]), randomBytes(8)]);
  const toBeSigned = sequence(
    tagged(0xa0, tagged(0x02, Buffer.from([2]))),
    tagged(0x02, serial),
    algorithm,
    name,
    validity,
    name,
    publicKey.export({ type: "spki", format: "der" }),
    extensions
  );
  const signature = sign("sha256", toBeSigned, privateKey);
  const certificate = sequence(toBeSigned, algorithm, tagged(0x03, Buffer.concat([Buffer.from([0]), signature])));
  const body = certificate.toString("base64").replace(/.{1,64}/gu, (line) => `${line}\n`);
  return { key: privateKey.export({ type: "pkcs8", format: "pem" }).toString(), cert: `-----BEGIN CERTIFICATE-----\n${body}-----END CERTIFICATE-----\n` };
}

function tagged(tag: number, content: Buffer): Buffer {
  const length = content.length;
  const header = length < 0x80 ? [tag, length] : length < 0x100 ? [tag, 0x81, length] : [tag, 0x82, length >> 8, length & 0xff];
  return Buffer.concat([Buffer.from(header), content]);
}

function sequence(...items: Buffer[]): Buffer {
  return tagged(0x30, Buffer.concat(items));
}

function set(...items: Buffer[]): Buffer {
  return tagged(0x31, Buffer.concat(items));
}

function objectId(dotted: string): Buffer {
  const [first = 0, second = 0, ...rest] = dotted.split(".").map(Number);
  const bytes = [first * 40 + second];
  for (const value of rest) {
    const groups = [value & 0x7f];
    for (let remaining = value >> 7; remaining > 0; remaining >>= 7) groups.unshift((remaining & 0x7f) | 0x80);
    bytes.push(...groups);
  }
  return tagged(0x06, Buffer.from(bytes));
}

function utcTime(date: Date): Buffer {
  const text = date.toISOString().replace(/[-:T]/gu, "").slice(2, 14);
  return tagged(0x17, Buffer.from(`${text}Z`));
}
