import { isDeepStrictEqual } from "node:util";
import type { SecretKeyRecord } from "../../../types.ts";

/** Compare complete wire records privately, including seals; never derive or log a digest. */
export class SecretKeysRecordView {
  readonly #records: Map<string, unknown>;

  constructor(records: Iterable<readonly [string, SecretKeyRecord]>) {
    this.#records = new Map([...records].map(([id, record]) => [id, JSON.parse(JSON.stringify(record)) as unknown]));
  }

  matches(records: Iterable<readonly [string, SecretKeyRecord]>): boolean {
    const current = new Map([...records].map(([id, record]) => [id, JSON.parse(JSON.stringify(record)) as unknown]));
    return isDeepStrictEqual(this.#records, current);
  }
}
