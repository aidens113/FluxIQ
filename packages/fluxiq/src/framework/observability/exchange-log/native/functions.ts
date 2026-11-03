import * as fs from "node:fs";
import process from "node:process";
import { originalNativeClockFunctions } from "../../../clock/native/index.ts";

const environmentDescriptor = Object.getOwnPropertyDescriptor(process, "env");
const environment: unknown = environmentDescriptor && "value" in environmentDescriptor ? environmentDescriptor.value : undefined;

/** Original platform identities; reading a descriptor never invokes its accessor. */
export const nativeExchangeLogFunctions = Object.freeze({
  fs,
  process,
  environment,
  date: originalNativeClockFunctions.date,
  now: originalNativeClockFunctions.now,
  operations: Object.freeze({
    mkdirSync: fs.mkdirSync,
    readdirSync: fs.readdirSync,
    existsSync: fs.existsSync,
    readFileSync: fs.readFileSync,
    writeFileSync: fs.writeFileSync,
    renameSync: fs.renameSync
  })
});
