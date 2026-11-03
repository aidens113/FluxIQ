import sqlite3 from "sqlite3";

type Member = { readonly chain: readonly object[]; readonly descriptor: PropertyDescriptor };

function capture(receiver: object, key: PropertyKey): Member {
  const chain: object[] = [];
  let current: object | null = receiver;
  while (current) {
    chain.push(current);
    const descriptor = Object.getOwnPropertyDescriptor(current, key);
    if (descriptor) return { chain, descriptor };
    current = Object.getPrototypeOf(current);
  }
  throw new Error("repository.execution.native_member_missing");
}

function unchanged(key: PropertyKey, member: Member): boolean {
  for (let index = 0; index < member.chain.length; index++) {
    const receiver = member.chain[index]!;
    const descriptor = Object.getOwnPropertyDescriptor(receiver, key);
    if (index + 1 < member.chain.length) {
      if (descriptor || Object.getPrototypeOf(receiver) !== member.chain[index + 1]) return false;
    } else {
      const original = member.descriptor;
      return descriptor !== undefined && descriptor.value === original.value
        && descriptor.get === original.get && descriptor.set === original.set
        && descriptor.writable === original.writable && descriptor.configurable === original.configurable
        && descriptor.enumerable === original.enumerable;
    }
  }
  return false;
}

const Database = sqlite3.Database;
const prototype = Database.prototype;
const run = prototype.run;
const all = prototype.all;
const get = prototype.get;
const exec = prototype.exec;
const close = prototype.close;
const configure = prototype.configure;
const date = Date;
const clock = performance;
const now = date.now;
const monotonic = clock.now;
const members: ReadonlyArray<readonly [PropertyKey, Member]> = [
  ["Database", capture(sqlite3, "Database")], ["prototype", capture(Database, "prototype")],
  ...["run", "all", "get", "exec", "close", "configure"].map(key => [key, capture(prototype, key)] as const),
  ["Date", capture(globalThis, "Date")], ["performance", capture(globalThis, "performance")],
  ["now", capture(date, "now")], ["now", capture(clock, "now")]
];

/** Original native pairs; identity reads never invoke a substituted getter. */
export const sqliteNativeDriver = Object.freeze({
  Database, run, all, get, exec, close, configure, date, clock, now, monotonic,
  assert(): void {
    if (members.some(([key, member]) => !unchanged(key, member))) throw new Error("repository.execution.native_driver_changed");
  }
});
