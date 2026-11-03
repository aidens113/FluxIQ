import * as fs from "node:fs";
import process from "node:process";

const dateDescriptor = Object.getOwnPropertyDescriptor(globalThis, "Date");
const date: unknown = dateDescriptor && "value" in dateDescriptor ? dateDescriptor.value : undefined;
const nowDescriptor = typeof date === "function" ? Object.getOwnPropertyDescriptor(date, "now") : undefined;
const now: unknown = nowDescriptor && "value" in nowDescriptor ? nowDescriptor.value : undefined;
const environmentDescriptor = Object.getOwnPropertyDescriptor(process, "env");
const environment: unknown = environmentDescriptor && "value" in environmentDescriptor ? environmentDescriptor.value : undefined;

/** Original platform identities; reading a descriptor never invokes its accessor. */
export const nativeExchangeLogFunctions = Object.freeze({
  fs,
  process,
  environment,
  date,
  now,
  operations: Object.freeze({
    mkdirSync: fs.mkdirSync,
    readdirSync: fs.readdirSync,
    existsSync: fs.existsSync,
    readFileSync: fs.readFileSync,
    writeFileSync: fs.writeFileSync,
    renameSync: fs.renameSync
  })
});
